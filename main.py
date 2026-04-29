"""
UniCost FastAPI Backend
Run: uvicorn main:app --reload --port 8001
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from typing import Optional
import pyodbc, time, csv, io, openpyxl, os, json, sys
from queue import Queue
import threading

# ── Config ────────────────────────────────────────────────────────────
def _config_path() -> str:
    env = os.environ.get("UNICOST_CONFIG_PATH")
    if env:
        return env
    base = os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "unicost_config.json")

_DEFAULT_CONFIG = {
    "server": "u",
    "database": "Per_Unit_Cost_db",
    "username": "unicost_admin",
    "password": "Polytech2026",
    "encrypt": True,
    "trust_cert": False,
    "timeout": 30,
}

def load_config() -> dict:
    path = _config_path()
    if os.path.exists(path):
        try:
            with open(path, "r") as f:
                return {**_DEFAULT_CONFIG, **json.load(f)}
        except Exception:
            pass
    return dict(_DEFAULT_CONFIG)

def save_config(cfg: dict):
    path = _config_path()
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "w") as f:
        json.dump(cfg, f, indent=2)

def build_conn_str(cfg: dict) -> str:
    return (
        f"DRIVER={{{_ODBC_DRIVER}}};"
        f"SERVER={cfg['server']};"
        f"DATABASE={cfg['database']};"
        f"UID={cfg['username']};"
        f"PWD={cfg['password']};"
        f"Encrypt={'yes' if cfg.get('encrypt', True) else 'no'};"
        f"TrustServerCertificate={'yes' if cfg.get('trust_cert', False) else 'no'};"
        f"Connection Timeout={cfg.get('timeout', 30)};"
    )

def db_error(e: Exception) -> HTTPException:
    """Convert any exception to an appropriate HTTPException with a clean message."""
    if isinstance(e, HTTPException):
        return e
    msg = str(e)
    if any(k in msg for k in ("08001", "08003", "08S01", "Login failed", "Cannot open server",
                               "network-related", "TCP Provider", "SSL", "IM002", "IM003",
                               "Data source name not found", "driver not found")):
        return HTTPException(503, "Cannot connect to the database. Please check your connection settings.")
    return HTTPException(500, msg)

# ── Cache ─────────────────────────────────────────────────────────────
_cache: dict = {}
_cache_lock = threading.Lock()
CACHE_TTL = 3600  # 1 hour

def cached_query(key, fn):
    now = time.time()
    with _cache_lock:
        if key in _cache and now - _cache[key]["time"] < CACHE_TTL:
            return _cache[key]["data"]
    result = fn()
    with _cache_lock:
        _cache[key] = {"data": result, "time": now}
    return result

def invalidate_cache():
    """Call after any INSERT/UPDATE/DELETE to clear stale cache."""
    with _cache_lock:
        _cache.clear()

# ── Connection Pool ───────────────────────────────────────────────────
def _pick_odbc_driver():
    preferred = ['ODBC Driver 18 for SQL Server', 'ODBC Driver 17 for SQL Server',
                 'ODBC Driver 13 for SQL Server', 'SQL Server']
    available = [d for d in pyodbc.drivers()]
    for d in preferred:
        if d in available:
            return d
    if available:
        return available[0]
    raise RuntimeError(f"No suitable ODBC driver found. Installed: {available}")

_ODBC_DRIVER = _pick_odbc_driver()

POOL_SIZE = 10
_pool: Queue = Queue(maxsize=POOL_SIZE)
_pool_lock = threading.Lock()

def _create_conn():
    try:
        cfg = load_config()
        conn = pyodbc.connect(build_conn_str(cfg), autocommit=False)
        conn.timeout = cfg.get("timeout", 30)
        return conn
    except pyodbc.Error as e:
        raise db_error(e)

def _init_pool():
    for _ in range(POOL_SIZE):
        try:
            _pool.put(_create_conn())
        except Exception as e:
            print(f"Pool init warning: {e}")

def get_conn():
    """Get a connection from the pool, create new if pool empty."""
    try:
        conn = _pool.get(timeout=5)
        try:
            conn.cursor().execute("SELECT 1")
            return conn
        except:
            try: conn.close()
            except: pass
            return _create_conn()
    except HTTPException:
        raise
    except:
        return _create_conn()

def release_conn(conn):
    """Return connection to pool."""
    try:
        if _pool.qsize() < POOL_SIZE:
            _pool.put(conn)
        else:
            conn.close()
    except:
        try: conn.close()
        except: pass

def query(sql, params=()):
    conn = get_conn()
    try:
        c = conn.cursor(); c.execute(sql, params)
        cols = [x[0] for x in c.description]
        rows = [dict(zip(cols, row)) for row in c.fetchall()]
        release_conn(conn)
        return rows
    except HTTPException:
        raise
    except Exception as e:
        try: conn.rollback()
        except: pass
        release_conn(conn)
        raise db_error(e)

def exec_proc(proc, params=()):
    ph = ",".join(["?" for _ in params])
    return query(f"EXEC {proc} {ph}" if params else f"EXEC {proc}", params)

def calc_avg(monthly_salary, yearly_load):
    try:
        ms, yl = float(monthly_salary or 0), float(yearly_load or 0)
        return int(round((12.0 * ms) / yl, 0)) if yl else None
    except: return None

def safe_int(v):
    try: return int(v) if v not in (None, "") else None
    except: return None

def safe_float(v):
    try: return float(v) if v not in (None, "") else None
    except: return None

async def read_upload(file: UploadFile):
    contents = await file.read()
    name = (file.filename or "").lower()
    if name.endswith(".xlsx") or name.endswith(".xls"):
        wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if len(rows) < 2: return []
        headers = [str(h).strip() if h is not None else f"col{i}" for i, h in enumerate(rows[0])]
        return [dict(zip(headers, row)) for row in rows[1:] if any(v is not None for v in row)]
    text = contents.decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))

def make_template(sheet_name, headers, example, notes):
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = sheet_name; ws.freeze_panes = "A2"
    for i, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=i, value=h)
        cell.font = Font(bold=True, color="FFFFFFFF", size=11)
        cell.fill = PatternFill("solid", fgColor="FF16213E")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = Border(bottom=Side(style="medium", color="FF2D6A4F"))
        ws.column_dimensions[get_column_letter(i)].width = 24
    ws.row_dimensions[1].height = 28
    ws.append(example)
    for i in range(1, len(headers)+1):
        cell = ws.cell(row=2, column=i)
        cell.fill = PatternFill("solid", fgColor="FFE8F4FD")
        cell.font = Font(color="FF546E7A", italic=True, size=10)
        cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[2].height = 20
    for i, note in enumerate(notes, 4):
        nc = ws.cell(row=i, column=1, value=note)
        nc.font = Font(color="FF78909C", italic=True, size=9)
    buf = io.BytesIO(); wb.save(buf); return buf.getvalue()

def xlsx_response(data, filename):
    return Response(content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"})

@asynccontextmanager
async def lifespan(app):
    import asyncio, concurrent.futures

    # Initialize connection pool immediately
    _init_pool()
    print(f"Connection pool initialized with {POOL_SIZE} connections")

    # Run warmup in background thread — server starts instantly
    def warmup():
        tasks = [
            lambda: exec_proc("sp_Get_Cost_Components"),
            lambda: exec_proc("sp_Calculate_Lecturer_Salary"),
            lambda: exec_proc("sp_Calculate_Variable_Allowance"),
            lambda: exec_proc("sp_Calculate_Fixed_Allowance"),
            lambda: exec_proc("sp_Calculate_Utility_Cost"),
            lambda: exec_proc("sp_Calculate_Other_Costs"),
            lambda: exec_proc("sp_Calculate_Total_Cost"),
            lambda: exec_proc("sp_Get_Income", ("institute",)),
            lambda: exec_proc("sp_Get_Income", ("department",)),
            lambda: exec_proc("sp_Get_Income", ("group",)),
            lambda: exec_proc("sp_Calculate_PerStudent_Analytics", ("institute",)),
            lambda: exec_proc("sp_Calculate_PerStudent_Analytics", ("department",)),
            lambda: exec_proc("sp_Calculate_PerStudent_Analytics", ("group",)),
            lambda: query("SELECT institute_id, institute_name, institute_code FROM institutes ORDER BY institute_id"),
            lambda: query("SELECT student_count AS Students_Total FROM vw_Students WHERE row_type = 'TOTAL'"),
            lambda: query("SELECT institute_id, institute_name, institute_code, student_count FROM vw_Students WHERE row_type = 'INSTITUTE' ORDER BY institute_id"),
        ]
        count = 0
        for task in tasks:
            try:
                task()
                count += 1
            except Exception as e:
                print(f"Warmup warning: {e}")
        print(f"Cache warmed up ({count}/{len(tasks)} tasks completed)")

    # Start warmup in background — don't block server startup
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    asyncio.get_event_loop().run_in_executor(executor, warmup)

    print("Application startup complete — warmup running in background")
    yield

    # Cleanup pool on shutdown
    executor.shutdown(wait=False)
    while not _pool.empty():
        try:
            conn = _pool.get_nowait()
            conn.close()
        except:
            pass
    print("Connection pool closed")

app = FastAPI(title="UniCost API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173","http://localhost:3000"], allow_methods=["*"], allow_headers=["*"])

# ── INSTITUTES ────────────────────────────────────────────────────────
@app.get("/institutes")
def get_institutes(): return query("SELECT institute_id, institute_name, institute_code FROM institutes ORDER BY institute_id")

@app.get("/institutes/template")
def institutes_template():
    return xlsx_response(make_template("Institutes", ["institute_name","institute_code"], ["Example Institute","1.08"], ["Do not include institute_id — auto-generated."]), "template_institutes.xlsx")

@app.get("/institutes/{institute_id}")
def get_institute(institute_id: int):
    r = query("SELECT * FROM institutes WHERE institute_id=?", (institute_id,))
    if not r: raise HTTPException(404, "Not found")
    return r[0]

@app.post("/institutes")
def insert_institute(body: dict):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("INSERT INTO institutes (institute_name, institute_code) VALUES (?,?)", (body.get("institute_name"), body.get("institute_code")))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"inserted": True}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.post("/institutes/import")
async def import_institutes(file: UploadFile = File(...)):
    try:
        rows = await read_upload(file); conn=get_conn(); c=conn.cursor(); count=0
        for row in rows:
            c.execute("INSERT INTO institutes (institute_name, institute_code) VALUES (?,?)", (row.get("institute_name",""), row.get("institute_code","")))
            count += 1
        conn.commit(); release_conn(conn); invalidate_cache(); return {"imported": count}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.put("/institutes/{institute_id}")
def update_institute(institute_id: int, body: dict):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("UPDATE institutes SET institute_name=?, institute_code=? WHERE institute_id=?", (body.get("institute_name"), body.get("institute_code"), institute_id))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"updated": institute_id}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.delete("/institutes/{institute_id}")
def delete_institute(institute_id: int):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("DELETE FROM groups WHERE prof_id IN (SELECT prof_id FROM professions WHERE institute_id=?)", (institute_id,))
        c.execute("DELETE FROM professions WHERE institute_id=?", (institute_id,))
        c.execute("DELETE FROM departments WHERE institute_id=?", (institute_id,))
        c.execute("DELETE FROM institutes WHERE institute_id=?", (institute_id,))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"deleted": institute_id}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.delete("/institutes")
def delete_all_institutes():
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("DELETE FROM groups"); c.execute("DELETE FROM professions")
        c.execute("DELETE FROM departments"); c.execute("DELETE FROM institutes")
        conn.commit(); release_conn(conn); invalidate_cache(); return {"deleted": "all"}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

# ── DEPARTMENTS ───────────────────────────────────────────────────────
@app.get("/departments")
def get_departments():
    return query("SELECT d.*, i.institute_name FROM departments d LEFT JOIN institutes i ON i.institute_id=d.institute_id ORDER BY d.department_id")

@app.get("/departments/template")
def departments_template():
    return xlsx_response(make_template("Departments",
        ["department_name","department_code","institute_id","yearly_load","hourly_salary","monthly_salary"],
        ["Example Dept","DEPT-01",1,960,500,250000],
        ["avg_hourly_rate = ROUND((12 * monthly_salary) / yearly_load, 0) — calculated automatically.",
         "Do NOT include avg_hourly_rate in your file.",
         "institute_id must match an existing institute."]), "template_departments.xlsx")

@app.get("/departments/{department_id}")
def get_department(department_id: int):
    r = query("SELECT * FROM departments WHERE department_id=?", (department_id,))
    if not r: raise HTTPException(404, "Not found")
    return r[0]

@app.post("/departments")
def insert_department(body: dict):
    try:
        avg = calc_avg(body.get("monthly_salary"), body.get("yearly_load"))
        conn=get_conn(); c=conn.cursor()
        c.execute("INSERT INTO departments (department_name,department_code,institute_id,yearly_load,hourly_salary,monthly_salary) VALUES (?,?,?,?,?,?)",
                  (body.get("department_name"), body.get("department_code"), safe_int(body.get("institute_id")),
                   safe_float(body.get("yearly_load")), safe_float(body.get("hourly_salary")),
                   safe_float(body.get("monthly_salary"))))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"inserted": True}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.post("/departments/import")
async def import_departments(file: UploadFile = File(...)):
    try:
        rows = await read_upload(file); conn=get_conn(); c=conn.cursor(); count=0
        for row in rows:
            avg = calc_avg(row.get("monthly_salary"), row.get("yearly_load"))
            c.execute("INSERT INTO departments (department_name,department_code,institute_id,yearly_load,hourly_salary,monthly_salary) VALUES (?,?,?,?,?,?)",
                      (row.get("department_name",""), row.get("department_code",""), safe_int(row.get("institute_id")),
                       safe_float(row.get("yearly_load")), safe_float(row.get("hourly_salary")),
                       safe_float(row.get("monthly_salary"))))
            count += 1
        conn.commit(); release_conn(conn); invalidate_cache(); return {"imported": count}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.put("/departments/{department_id}")
def update_department(department_id: int, body: dict):
    try:
        avg = calc_avg(body.get("monthly_salary"), body.get("yearly_load"))
        conn=get_conn(); c=conn.cursor()
        c.execute("UPDATE departments SET department_name=?,department_code=?,institute_id=?,yearly_load=?,hourly_salary=?,monthly_salary=? WHERE department_id=?",
                  (body.get("department_name"), body.get("department_code"), safe_int(body.get("institute_id")),
                   safe_float(body.get("yearly_load")), safe_float(body.get("hourly_salary")),
                   safe_float(body.get("monthly_salary")), department_id))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"updated": department_id}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.delete("/departments/{department_id}")
def delete_department(department_id: int):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("DELETE FROM departments WHERE department_id=?", (department_id,))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"deleted": department_id}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.delete("/departments")
def delete_all_departments():
    try:
        conn=get_conn(); c=conn.cursor(); c.execute("DELETE FROM departments")
        conn.commit(); release_conn(conn); invalidate_cache(); return {"deleted": "all"}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

# ── GROUPS ────────────────────────────────────────────────────────────
@app.get("/groups")
def get_groups():
    return query("SELECT g.*,d.department_name,i.institute_name FROM groups g LEFT JOIN departments d ON d.department_id=g.department_id LEFT JOIN professions p ON p.prof_id=g.prof_id LEFT JOIN institutes i ON i.institute_id=p.institute_id ORDER BY g.group_id")

@app.get("/groups/template")
def groups_template():
    return xlsx_response(make_template("Groups",
        ["group_name","group_code","degree","edu_type","student_count","paid_edu_count","free_edu_count","tuition_fee","prof_id"],
        ["ՏՀՏ-211","ICT-21-1","Bachelor","Day",25,20,5,450000,1],
        ["degree: Bachelor, Master, PhD","edu_type: Day, Evening, Distance","prof_id must match an existing profession."]), "template_groups.xlsx")

@app.get("/groups/{group_id}")
def get_group(group_id: int):
    r = query("SELECT * FROM groups WHERE group_id=?", (group_id,))
    if not r: raise HTTPException(404, "Not found")
    return r[0]

@app.post("/groups")
def insert_group(body: dict):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("INSERT INTO groups (group_name,group_code,degree,edu_type,student_count,paid_edu_count,free_edu_count,tuition_fee,prof_id,department_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
                  (body.get("group_name"), body.get("group_code"), body.get("degree"), body.get("edu_type"),
                   safe_int(body.get("student_count")) or 0, safe_int(body.get("paid_edu_count")) or 0,
                   safe_int(body.get("free_edu_count")) or 0, safe_float(body.get("tuition_fee")) or 0,
                   safe_int(body.get("prof_id")), safe_int(body.get("department_id"))))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"inserted": True}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.post("/groups/import")
async def import_groups(file: UploadFile = File(...)):
    try:
        rows = await read_upload(file); conn=get_conn(); c=conn.cursor(); count=0
        for row in rows:
            c.execute("INSERT INTO groups (group_name,group_code,degree,edu_type,student_count,paid_edu_count,free_edu_count,tuition_fee,prof_id,department_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
                      (row.get("group_name",""), row.get("group_code",""), row.get("degree",""), row.get("edu_type",""),
                       safe_int(row.get("student_count")) or 0, safe_int(row.get("paid_edu_count")) or 0,
                       safe_int(row.get("free_edu_count")) or 0, safe_float(row.get("tuition_fee")) or 0,
                       safe_int(row.get("prof_id")), safe_int(row.get("department_id"))))
            count += 1
        conn.commit(); release_conn(conn); invalidate_cache(); return {"imported": count}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.put("/groups/{group_id}")
def update_group(group_id: int, body: dict):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("UPDATE groups SET group_name=?,group_code=?,degree=?,edu_type=?,student_count=?,paid_edu_count=?,free_edu_count=?,tuition_fee=?,prof_id=?,department_id=? WHERE group_id=?",
                  (body.get("group_name"), body.get("group_code"), body.get("degree"), body.get("edu_type"),
                   safe_int(body.get("student_count")) or 0, safe_int(body.get("paid_edu_count")) or 0,
                   safe_int(body.get("free_edu_count")) or 0, safe_float(body.get("tuition_fee")) or 0,
                   safe_int(body.get("prof_id")), safe_int(body.get("department_id")), group_id))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"updated": group_id}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.delete("/groups/{group_id}")
def delete_group(group_id: int):
    try:
        conn=get_conn(); c=conn.cursor(); c.execute("DELETE FROM groups WHERE group_id=?", (group_id,))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"deleted": group_id}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.delete("/groups")
def delete_all_groups():
    try:
        conn=get_conn(); c=conn.cursor(); c.execute("DELETE FROM groups")
        conn.commit(); release_conn(conn); invalidate_cache(); return {"deleted": "all"}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

# ── SUBJECTS ──────────────────────────────────────────────────────────
@app.get("/subjects")
def get_subjects():
    return query("SELECT s.subject_id,s.subject_name,d.department_name,SUM(sg.hours_sem1) AS hours_sem1,SUM(sg.hours_sem2) AS hours_sem2,SUM(sg.hours_yearly) AS hours_yearly FROM subjects s LEFT JOIN departments d ON d.department_id=s.department_id LEFT JOIN Subject_Group sg ON sg.subject_id=s.subject_id GROUP BY s.subject_id,s.subject_name,d.department_name ORDER BY s.subject_id")

@app.get("/subjects/template")
def subjects_template():
    return xlsx_response(make_template("Subjects", ["subject_name","department_id","hours_sem1","hours_sem2"],
        ["Բարձր մաթեմատիկա",1,60,60],
        ["hours_yearly = hours_sem1 + hours_sem2 — calculated automatically.",
         "department_id must match an existing department."]), "template_subjects.xlsx")

@app.post("/subjects")
def insert_subject(body: dict):
    try:
        conn=get_conn(); c=conn.cursor()
        s1 = safe_float(body.get("hours_sem1")) or 0
        s2 = safe_float(body.get("hours_sem2")) or 0
        c.execute("SELECT ISNULL(MAX(subject_id), 0) + 1 FROM subjects")
        new_id = c.fetchone()[0]
        c.execute("INSERT INTO subjects (subject_id, subject_name, department_id) VALUES (?,?,?)", (new_id, body.get("subject_name"), safe_int(body.get("department_id"))))
        if s1 or s2:
            c.execute("INSERT INTO Subject_Group (subject_id,hours_sem1,hours_sem2,hours_yearly) VALUES (?,?,?,?)", (new_id, s1, s2, s1+s2))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"inserted": True}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.post("/subjects/import")
async def import_subjects(file: UploadFile = File(...)):
    try:
        rows = await read_upload(file); conn=get_conn(); c=conn.cursor(); count=0
        c.execute("SELECT ISNULL(MAX(subject_id), 0) + 1 FROM subjects")
        next_id = c.fetchone()[0]
        for row in rows:
            s1 = safe_float(row.get("hours_sem1")) or 0
            s2 = safe_float(row.get("hours_sem2")) or 0
            new_id = next_id
            c.execute("INSERT INTO subjects (subject_id, subject_name, department_id) VALUES (?,?,?)", (new_id, row.get("subject_name",""), safe_int(row.get("department_id"))))
            if s1 or s2:
                c.execute("INSERT INTO Subject_Group (subject_id,hours_sem1,hours_sem2,hours_yearly) VALUES (?,?,?,?)", (new_id, s1, s2, s1+s2))
            next_id += 1
            count += 1
        conn.commit(); release_conn(conn); invalidate_cache(); return {"imported": count}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.put("/subjects/{subject_id}")
def update_subject(subject_id: int, body: dict):
    try:
        s1 = safe_float(body.get("hours_sem1")) or 0
        s2 = safe_float(body.get("hours_sem2")) or 0
        conn=get_conn(); c=conn.cursor()
        c.execute("UPDATE subjects SET subject_name=?,department_id=? WHERE subject_id=?", (body.get("subject_name"), safe_int(body.get("department_id")), subject_id))
        c.execute("SELECT subject_id FROM Subject_Group WHERE subject_id=?", (subject_id,))
        if c.fetchone():
            c.execute("UPDATE Subject_Group SET hours_sem1=?,hours_sem2=?,hours_yearly=? WHERE subject_id=?", (s1, s2, s1+s2, subject_id))
        else:
            c.execute("INSERT INTO Subject_Group (subject_id,hours_sem1,hours_sem2,hours_yearly) VALUES (?,?,?,?)", (subject_id, s1, s2, s1+s2))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"updated": subject_id}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.delete("/subjects/{subject_id}")
def delete_subject(subject_id: int):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("DELETE FROM Subject_Group WHERE subject_id=?", (subject_id,))
        c.execute("DELETE FROM subjects WHERE subject_id=?", (subject_id,))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"deleted": subject_id}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.delete("/subjects")
def delete_all_subjects():
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("DELETE FROM Subject_Group"); c.execute("DELETE FROM subjects")
        conn.commit(); release_conn(conn); invalidate_cache(); return {"deleted": "all"}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

# ── PROFESSIONS ───────────────────────────────────────────────────────
@app.get("/professions")
def get_professions():
    return query("SELECT p.*,i.institute_name FROM professions p LEFT JOIN institutes i ON i.institute_id=p.institute_id ORDER BY p.prof_id")

@app.get("/professions/template")
def professions_template():
    return xlsx_response(make_template("Professions",["prof_name","institute_id"],
        ["Ինֆորմատիկա",1],["institute_id must match an existing institute."]), "template_professions.xlsx")

@app.post("/professions")
def insert_profession(body: dict):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("INSERT INTO professions (prof_name,institute_id) VALUES (?,?)", (body.get("prof_name"), safe_int(body.get("institute_id"))))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"inserted": True}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.post("/professions/import")
async def import_professions(file: UploadFile = File(...)):
    try:
        rows = await read_upload(file); conn=get_conn(); c=conn.cursor(); count=0
        for row in rows:
            c.execute("INSERT INTO professions (prof_name,institute_id) VALUES (?,?)", (row.get("prof_name",""), safe_int(row.get("institute_id"))))
            count += 1
        conn.commit(); release_conn(conn); invalidate_cache(); return {"imported": count}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.put("/professions/{prof_id}")
def update_profession(prof_id: int, body: dict):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("UPDATE professions SET prof_name=?,institute_id=? WHERE prof_id=?", (body.get("prof_name"), safe_int(body.get("institute_id")), prof_id))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"updated": prof_id}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.delete("/professions/{prof_id}")
def delete_profession(prof_id: int):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("DELETE FROM groups WHERE prof_id=?", (prof_id,))
        c.execute("DELETE FROM professions WHERE prof_id=?", (prof_id,))
        conn.commit(); release_conn(conn); invalidate_cache(); return {"deleted": prof_id}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.delete("/professions")
def delete_all_professions():
    try:
        conn=get_conn(); c=conn.cursor(); c.execute("DELETE FROM professions")
        conn.commit(); release_conn(conn); invalidate_cache(); return {"deleted": "all"}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

# ── COSTS ─────────────────────────────────────────────────────────────
@app.get("/costs/components")
def get_cost_components(institute_id: Optional[int] = Query(None)):
    key = f"costs_components_{institute_id}"
    return cached_query(key, lambda: exec_proc("sp_Get_Cost_Components", (institute_id,)) if institute_id else exec_proc("sp_Get_Cost_Components"))

@app.get("/costs/lecturer-salary")
def get_lecturer_salary(institute_id: Optional[int] = Query(None)):
    key = f"lecturer_{institute_id}"
    return cached_query(key, lambda: exec_proc("sp_Calculate_Lecturer_Salary", (institute_id,)) if institute_id else exec_proc("sp_Calculate_Lecturer_Salary"))

@app.get("/costs/variable-allowance")
def get_variable_allowance(institute_id: Optional[int] = Query(None)):
    key = f"variable_{institute_id}"
    return cached_query(key, lambda: exec_proc("sp_Calculate_Variable_Allowance", (institute_id,)) if institute_id else exec_proc("sp_Calculate_Variable_Allowance"))

@app.get("/costs/fixed-allowance")
def get_fixed_allowance(institute_id: Optional[int] = Query(None)):
    key = f"fixed_{institute_id}"
    return cached_query(key, lambda: exec_proc("sp_Calculate_Fixed_Allowance", (institute_id,)) if institute_id else exec_proc("sp_Calculate_Fixed_Allowance"))

@app.get("/costs/utility-cost")
def get_utility_cost(institute_id: Optional[int] = Query(None)):
    key = f"utility_{institute_id}"
    return cached_query(key, lambda: exec_proc("sp_Calculate_Utility_Cost", (institute_id,)) if institute_id else exec_proc("sp_Calculate_Utility_Cost"))

@app.get("/costs/other-costs")
def get_other_costs(institute_id: Optional[int] = Query(None)):
    key = f"other_{institute_id}"
    return cached_query(key, lambda: exec_proc("sp_Calculate_Other_Costs", (institute_id,)) if institute_id else exec_proc("sp_Calculate_Other_Costs"))

@app.get("/costs/all-costs")
def get_all_costs(institute_id: Optional[int] = Query(None)):
    key = f"allcosts_{institute_id}"
    return cached_query(key, lambda: exec_proc("sp_Calculate_Total_Cost", (institute_id,)) if institute_id else exec_proc("sp_Calculate_Total_Cost"))

@app.get("/income")
def get_income(level: str = "institute", institute_id: Optional[int] = Query(None)):
    key = f"income_{level}_{institute_id}"
    return cached_query(key, lambda: exec_proc("sp_Get_Income", (level, institute_id)) if institute_id else exec_proc("sp_Get_Income", (level,)))




# ── EXCEL EXPORT ──────────────────────────────────────────────────────
def make_excel(sheet_name: str, headers: list, rows: list, number_cols: list = []) -> bytes:
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = sheet_name
    ws.freeze_panes = "A2"
    # Header row
    for col_idx, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=h)
        cell.font = Font(bold=True, color="FFFFFFFF", size=11)
        cell.fill = PatternFill("solid", fgColor="FF16213E")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = Border(bottom=Side(style="medium", color="FF7C3AED"))
        ws.column_dimensions[get_column_letter(col_idx)].width = 22
    ws.row_dimensions[1].height = 28
    # Data rows
    for row_idx, row in enumerate(rows, 2):
        for col_idx, val in enumerate(row, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.alignment = Alignment(horizontal="left", vertical="center")
            if col_idx in number_cols and isinstance(val, (int, float)):
                cell.number_format = '#,##0'
                cell.alignment = Alignment(horizontal="right", vertical="center")

        ws.row_dimensions[row_idx].height = 18
    # Totals row for numeric columns
    if rows and number_cols:
        total_row = row_idx + 1
        for col_idx, h in enumerate(headers, 1):
            cell = ws.cell(row=total_row, column=col_idx)
            if col_idx in number_cols:
                cell.value = sum(
                    row[col_idx-1] for row in rows
                    if isinstance(row[col_idx-1], (int, float))
                )
                cell.number_format = '#,##0'
                cell.alignment = Alignment(horizontal="right", vertical="center")
            else:
                cell.value = "TOTAL" if col_idx == 1 else ""
            cell.font = Font(bold=True, color="FFFFFFFF", size=11)
            cell.fill = PatternFill("solid", fgColor="FF7C3AED")
            cell.border = Border(top=Side(style="medium", color="FF7C3AED"))
        ws.row_dimensions[total_row].height = 24
    buf = io.BytesIO(); wb.save(buf); return buf.getvalue()

def xlsx_export_response(data: bytes, filename: str):
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/export/cost-components")
def export_cost_components_excel(institute_id: Optional[int] = Query(None)):
    key = f"costs_components_{institute_id}"
    data = cached_query(key, lambda: exec_proc("sp_Get_Cost_Components", (institute_id,)) if institute_id else exec_proc("sp_Get_Cost_Components"))
    headers = ["Institute", "Code", "Students", "Lecturer Salary", "Variable", "Fixed", "Utility", "Other", "Allowance", "All Costs"]
    rows = [[r.get("institute_name",""), r.get("institute_code",""), r.get("student_count",0),
             r.get("lecturer_salary",0), r.get("variable_allowance",0), r.get("fixed_allowance",0),
             r.get("utility_cost",0), r.get("other_costs",0), r.get("allowance_costs",0), r.get("all_costs",0)]
            for r in data]
    return xlsx_export_response(make_excel("Cost Components", headers, rows, [3,4,5,6,7,8,9,10]), "cost_components.xlsx")

@app.get("/export/income")
def export_income_excel(level: str = "institute", institute_id: Optional[int] = Query(None)):
    key = f"income_{level}_{institute_id}"
    data = cached_query(key, lambda: exec_proc("sp_Get_Income", (level, institute_id)) if institute_id else exec_proc("sp_Get_Income", (level,)))
    if level == "institute":
        headers = ["Institute", "Code", "Groups", "Students", "Income"]
        rows = [[r.get("institute_name",""), r.get("institute_code",""), r.get("group_count",0),
                 r.get("total_students",0), r.get("institute_income",0)] for r in data]
        num_cols = [3,4,5]
    elif level == "department":
        headers = ["Institute", "Department", "Students", "Income"]
        rows = [[r.get("institute_name",""), r.get("department_name",""),
                 r.get("total_students",0), r.get("department_income",0)] for r in data]
        num_cols = [3,4]
    else:
        headers = ["Institute", "Department", "Group", "Code", "Degree", "Type", "Students", "Tuition Fee", "Income"]
        rows = [[r.get("institute_name",""), r.get("department_name",""), r.get("group_name",""),
                 r.get("group_code",""), r.get("degree",""), r.get("edu_type",""),
                 r.get("student_count",0), r.get("tuition_fee",0), r.get("group_income",0)] for r in data]
        num_cols = [7,8,9]
    return xlsx_export_response(make_excel(f"Income - {level}", headers, rows, num_cols), f"income_{level}.xlsx")

@app.get("/export/analytics")
def export_analytics_excel(level: str = "institute", institute_id: Optional[int] = Query(None)):
    try:
        if institute_id:
            records = exec_proc("sp_Calculate_PerStudent_Analytics", (level, institute_id))
        else:
            records = exec_proc("sp_Calculate_PerStudent_Analytics", (level,))
        if not records:
            records = []
        if level == "institute":
            headers = ["Institute", "Students", "All Costs", "Income", "Cost/Student", "Profit", "Avg Tuition", "Profitability"]
            excel_rows = [[r.get("institute_name",""), r.get("student_count",0), r.get("all_costs",0),
                     r.get("income",0), r.get("cost_per_student",0), r.get("profit",0),
                     r.get("avg_tuition_fee",0), r.get("profitability_ratio",0)] for r in records]
            num_cols = [2,3,4,5,6,7,8]
        elif level == "department":
            headers = ["Institute", "Department", "Students", "Dept Cost", "Income", "Cost/Student", "Profit"]
            excel_rows = [[r.get("institute_name",""), r.get("department_name",""), r.get("student_count",0),
                     r.get("dept_cost",0), r.get("income",0), r.get("cost_per_student",0), r.get("profit",0)] for r in records]
            num_cols = [3,4,5,6,7]
        else:
            headers = ["Institute", "Department", "Group", "Code", "Degree", "Type", "Students", "Tuition", "Income", "Group Cost", "Cost/Student", "Profit"]
            excel_rows = [[r.get("institute_name",""), r.get("department_name",""), r.get("group_name",""),
                     r.get("group_code",""), r.get("degree",""), r.get("edu_type",""),
                     r.get("student_count",0), r.get("tuition_fee",0), r.get("income",0),
                     r.get("group_cost",0), r.get("cost_per_student",0), r.get("profit",0)] for r in records]
            num_cols = [7,8,9,10,11,12]
        return xlsx_export_response(make_excel(f"Analytics - {level}", headers, excel_rows, num_cols), f"analytics_{level}.xlsx")
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/export/institutes")
def export_institutes_excel():
    data = query("SELECT institute_id, institute_name, institute_code FROM institutes ORDER BY institute_id")
    headers = ["ID", "Name", "Code"]
    rows = [[r["institute_id"], r["institute_name"], r["institute_code"]] for r in data]
    return xlsx_export_response(make_excel("Institutes", headers, rows, [1]), "institutes.xlsx")

@app.get("/export/departments")
def export_departments_excel():
    data = query("SELECT d.*, i.institute_name FROM departments d LEFT JOIN institutes i ON i.institute_id=d.institute_id ORDER BY d.department_id")
    headers = ["ID", "Name", "Code", "Institute", "Yearly Load", "Hourly Salary", "Monthly Salary", "Avg Hourly Rate"]
    rows = [[r["department_id"], r["department_name"], r["department_code"], r.get("institute_name",""),
             r.get("yearly_load",0), r.get("hourly_salary",0), r.get("monthly_salary",0), r.get("avg_hourly_rate",0)] for r in data]
    return xlsx_export_response(make_excel("Departments", headers, rows, [5,6,7,8]), "departments.xlsx")


@app.get("/export/subjects")
def export_subjects_excel():
    data = query("SELECT s.subject_id, s.subject_name, d.department_name, SUM(sg.hours_sem1) AS hours_sem1, SUM(sg.hours_sem2) AS hours_sem2, SUM(sg.hours_yearly) AS hours_yearly FROM subjects s LEFT JOIN departments d ON d.department_id=s.department_id LEFT JOIN Subject_Group sg ON sg.subject_id=s.subject_id GROUP BY s.subject_id, s.subject_name, d.department_name ORDER BY s.subject_id")
    headers = ["ID", "Subject Name", "Department", "Sem 1 Hours", "Sem 2 Hours", "Yearly Hours"]
    rows = [[r["subject_id"], r["subject_name"], r.get("department_name",""), r.get("hours_sem1",0), r.get("hours_sem2",0), r.get("hours_yearly",0)] for r in data]
    return xlsx_export_response(make_excel("Subjects", headers, rows, [4,5,6]), "subjects.xlsx")

@app.get("/export/professions")
def export_professions_excel():
    data = query("SELECT p.prof_id, p.prof_name, i.institute_name FROM professions p LEFT JOIN institutes i ON i.institute_id=p.institute_id ORDER BY p.prof_id")
    headers = ["ID", "Profession", "Institute"]
    rows = [[r["prof_id"], r["prof_name"], r.get("institute_name","")] for r in data]
    return xlsx_export_response(make_excel("Professions", headers, rows, [1]), "professions.xlsx")

@app.get("/export/groups")
def export_groups_excel():
    data = query("SELECT g.*,i.institute_name FROM groups g LEFT JOIN professions p ON p.prof_id=g.prof_id LEFT JOIN institutes i ON i.institute_id=p.institute_id ORDER BY g.group_id")
    headers = ["ID", "Name", "Code", "Degree", "Edu Type", "Students", "Paid", "Free", "Tuition Fee", "Institute"]
    rows = [[r["group_id"], r["group_name"], r["group_code"], r.get("degree",""), r.get("edu_type",""),
             r.get("student_count",0), r.get("paid_edu_count",0), r.get("free_edu_count",0),
             r.get("tuition_fee",0), r.get("institute_name","")] for r in data]
    return xlsx_export_response(make_excel("Groups", headers, rows, [6,7,8,9]), "groups.xlsx")

# ── DUPLICATE CHECKS ──────────────────────────────────────────────────
@app.get("/institutes/check-duplicate")
def check_institute_duplicate(institute_code: str = "", institute_id: int = None):
    try:
        if not institute_code: return {"duplicate": False}
        sql = "SELECT COUNT(*) FROM institutes WHERE institute_code = ?"
        params = [institute_code]
        if institute_id:
            sql += " AND institute_id != ?"
            params.append(institute_id)
        conn = get_conn(); c = conn.cursor()
        c.execute(sql, params)
        count = c.fetchone()[0]
        release_conn(conn)
        return {"duplicate": count > 0, "field": "institute_code", "value": institute_code}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.get("/departments/check-duplicate")
def check_department_duplicate(department_code: str = "", department_id: int = None):
    try:
        if not department_code: return {"duplicate": False}
        sql = "SELECT COUNT(*) FROM departments WHERE department_code = ?"
        params = [department_code]
        if department_id:
            sql += " AND department_id != ?"
            params.append(department_id)
        conn = get_conn(); c = conn.cursor()
        c.execute(sql, params)
        count = c.fetchone()[0]
        release_conn(conn)
        return {"duplicate": count > 0, "field": "department_code", "value": department_code}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.get("/groups/check-duplicate")
def check_group_duplicate(group_code: str = "", group_id: int = None):
    try:
        if not group_code: return {"duplicate": False}
        sql = "SELECT COUNT(*) FROM groups WHERE group_code = ?"
        params = [group_code]
        if group_id:
            sql += " AND group_id != ?"
            params.append(group_id)
        conn = get_conn(); c = conn.cursor()
        c.execute(sql, params)
        count = c.fetchone()[0]
        release_conn(conn)
        return {"duplicate": count > 0, "field": "group_code", "value": group_code}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.get("/subjects/check-duplicate")
def check_subject_duplicate(subject_name: str = "", department_id: int = None, subject_id: int = None):
    try:
        if not subject_name: return {"duplicate": False}
        sql = "SELECT COUNT(*) FROM subjects WHERE subject_name = ?"
        params = [subject_name]
        if department_id:
            sql += " AND department_id = ?"
            params.append(department_id)
        if subject_id:
            sql += " AND subject_id != ?"
            params.append(subject_id)
        conn = get_conn(); c = conn.cursor()
        c.execute(sql, params)
        count = c.fetchone()[0]
        release_conn(conn)
        return {"duplicate": count > 0, "field": "subject_name", "value": subject_name}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

@app.get("/professions/check-duplicate")
def check_profession_duplicate(prof_name: str = "", institute_id: int = None, prof_id: int = None):
    try:
        if not prof_name: return {"duplicate": False}
        sql = "SELECT COUNT(*) FROM professions WHERE prof_name = ?"
        params = [prof_name]
        if institute_id:
            sql += " AND institute_id = ?"
            params.append(institute_id)
        if prof_id:
            sql += " AND prof_id != ?"
            params.append(prof_id)
        conn = get_conn(); c = conn.cursor()
        c.execute(sql, params)
        count = c.fetchone()[0]
        release_conn(conn)
        return {"duplicate": count > 0, "field": "prof_name", "value": prof_name}
    except HTTPException: raise
    except Exception as e: raise db_error(e)

# ── ANALYTICS ─────────────────────────────────────────────────────────
@app.get("/analytics/per-student")
def get_per_student_analytics(
    level: str = "institute",
    institute_id: Optional[int] = Query(None)
):
    key = f"analytics_{level}_{institute_id}"
    if institute_id:
        return cached_query(key, lambda: exec_proc("sp_Calculate_PerStudent_Analytics", (level, institute_id)))
    return cached_query(key, lambda: exec_proc("sp_Calculate_PerStudent_Analytics", (level,)))

# ── STUDENTS ──────────────────────────────────────────────────────────
@app.get("/students/total")
def get_total_students():
    return query("SELECT student_count AS Students_Total FROM vw_Students WHERE row_type = 'TOTAL'")

@app.get("/students/by-institute")
def get_students_by_institute():
    return query("SELECT institute_id, institute_name, institute_code, student_count FROM vw_Students WHERE row_type = 'INSTITUTE' ORDER BY institute_id")

# ── HEALTH ────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    try:
        conn = _pool.get(timeout=2)
        conn.cursor().execute("SELECT 1")
        _pool.put(conn)
        return {"status": "ok", "db": "connected"}
    except:
        try:
            conn = _create_conn()
            conn.cursor().execute("SELECT 1")
            release_conn(conn)
            return {"status": "ok", "db": "connected"}
        except Exception as e:
            return JSONResponse(status_code=503, content={"status": "error", "db": "disconnected", "detail": str(e)})

# ── CONFIG ────────────────────────────────────────────────────────────
@app.get("/config")
def get_config():
    cfg = load_config()
    return {k: ("***" if k == "password" and v else v) for k, v in cfg.items()}

@app.post("/config")
def set_config(body: dict):
    try:
        cfg = load_config()
        for k in ("server", "database", "username", "encrypt", "trust_cert", "timeout"):
            if k in body:
                cfg[k] = body[k]
        if body.get("password") and body["password"] != "***":
            cfg["password"] = body["password"]
        save_config(cfg)
        # Drain pool so next requests use the new config
        while not _pool.empty():
            try:
                c = _pool.get_nowait()
                try: c.close()
                except: pass
            except: break
        invalidate_cache()
        return {"saved": True}
    except HTTPException:
        raise
    except Exception as e:
        raise db_error(e)

@app.post("/test-connection")
def test_connection(body: dict):
    try:
        test_cfg = {**load_config(), **{k: v for k, v in body.items() if k != "password" or (v and v != "***")}}
        conn = pyodbc.connect(build_conn_str(test_cfg), autocommit=False, timeout=10)
        conn.cursor().execute("SELECT 1")
        conn.close()
        return {"ok": True}
    except pyodbc.Error as e:
        raise HTTPException(503, "Cannot connect to the database. Please verify the settings.")

# ── ENTRY POINT (for PyInstaller exe) ────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")