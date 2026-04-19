"""
UniCost FastAPI Backend
Run: uvicorn main:app --reload --port 8001
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from typing import Optional
import pyodbc, time, csv, io, openpyxl

_cache: dict = {}
CACHE_TTL = 300

def cached_query(key, fn):
    now = time.time()
    if key in _cache and now - _cache[key]["time"] < CACHE_TTL:
        return _cache[key]["data"]
    result = fn()
    _cache[key] = {"data": result, "time": now}
    return result

CONN_STR = (
    "DRIVER={SQL Server};"
    "SERVER=DESKTOP-PVC7KLP\\SQLEXPRESS;"
    "DATABASE=Per_Unit_Cost;"
    "Trusted_Connection=yes;"
)

def get_conn(): return pyodbc.connect(CONN_STR)

def query(sql, params=()):
    conn = get_conn()
    try:
        c = conn.cursor(); c.execute(sql, params)
        cols = [x[0] for x in c.description]
        return [dict(zip(cols, row)) for row in c.fetchall()]
    except Exception as e: raise HTTPException(500, str(e))
    finally: conn.close()

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
    try:
        exec_proc("sp_Get_Cost_Components"); exec_proc("sp_Calculate_Lecturer_Salary")
        exec_proc("sp_Calculate_Variable_Allowance"); exec_proc("sp_Calculate_Fixed_Allowance")
        exec_proc("sp_Calculate_Utility_Cost"); exec_proc("sp_Calculate_Other_Costs")
        exec_proc("sp_Calculate_Total_Cost"); exec_proc("sp_Get_Income", ("institute",))
        exec_proc("sp_Calculate_PerStudent_Analytics", ("institute",))
        exec_proc("sp_Calculate_PerStudent_Analytics", ("department",))
        exec_proc("sp_Calculate_PerStudent_Analytics", ("group",))
    except: pass
    yield

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
        conn.commit(); conn.close(); return {"inserted": True}
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/institutes/import")
async def import_institutes(file: UploadFile = File(...)):
    try:
        rows = await read_upload(file); conn=get_conn(); c=conn.cursor(); count=0
        for row in rows:
            c.execute("INSERT INTO institutes (institute_name, institute_code) VALUES (?,?)", (row.get("institute_name",""), row.get("institute_code","")))
            count += 1
        conn.commit(); conn.close(); return {"imported": count}
    except Exception as e: raise HTTPException(500, str(e))

@app.put("/institutes/{institute_id}")
def update_institute(institute_id: int, body: dict):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("UPDATE institutes SET institute_name=?, institute_code=? WHERE institute_id=?", (body.get("institute_name"), body.get("institute_code"), institute_id))
        conn.commit(); conn.close(); return {"updated": institute_id}
    except Exception as e: raise HTTPException(500, str(e))

@app.delete("/institutes/{institute_id}")
def delete_institute(institute_id: int):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("DELETE FROM groups WHERE prof_id IN (SELECT prof_id FROM professions WHERE institute_id=?)", (institute_id,))
        c.execute("DELETE FROM professions WHERE institute_id=?", (institute_id,))
        c.execute("DELETE FROM departments WHERE institute_id=?", (institute_id,))
        c.execute("DELETE FROM institutes WHERE institute_id=?", (institute_id,))
        conn.commit(); conn.close(); return {"deleted": institute_id}
    except Exception as e: raise HTTPException(500, str(e))

@app.delete("/institutes")
def delete_all_institutes():
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("DELETE FROM groups"); c.execute("DELETE FROM professions")
        c.execute("DELETE FROM departments"); c.execute("DELETE FROM institutes")
        conn.commit(); conn.close(); return {"deleted": "all"}
    except Exception as e: raise HTTPException(500, str(e))

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
        c.execute("INSERT INTO departments (department_name,department_code,institute_id,yearly_load,hourly_salary,monthly_salary,avg_hourly_rate) VALUES (?,?,?,?,?,?,?)",
                  (body.get("department_name"), body.get("department_code"), safe_int(body.get("institute_id")),
                   safe_float(body.get("yearly_load")), safe_float(body.get("hourly_salary")),
                   safe_float(body.get("monthly_salary")), avg))
        conn.commit(); conn.close(); return {"inserted": True, "avg_hourly_rate": avg}
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/departments/import")
async def import_departments(file: UploadFile = File(...)):
    try:
        rows = await read_upload(file); conn=get_conn(); c=conn.cursor(); count=0
        for row in rows:
            avg = calc_avg(row.get("monthly_salary"), row.get("yearly_load"))
            c.execute("INSERT INTO departments (department_name,department_code,institute_id,yearly_load,hourly_salary,monthly_salary,avg_hourly_rate) VALUES (?,?,?,?,?,?,?)",
                      (row.get("department_name",""), row.get("department_code",""), safe_int(row.get("institute_id")),
                       safe_float(row.get("yearly_load")), safe_float(row.get("hourly_salary")),
                       safe_float(row.get("monthly_salary")), avg))
            count += 1
        conn.commit(); conn.close(); return {"imported": count}
    except Exception as e: raise HTTPException(500, str(e))

@app.put("/departments/{department_id}")
def update_department(department_id: int, body: dict):
    try:
        avg = calc_avg(body.get("monthly_salary"), body.get("yearly_load"))
        conn=get_conn(); c=conn.cursor()
        c.execute("UPDATE departments SET department_name=?,department_code=?,institute_id=?,yearly_load=?,hourly_salary=?,monthly_salary=?,avg_hourly_rate=? WHERE department_id=?",
                  (body.get("department_name"), body.get("department_code"), safe_int(body.get("institute_id")),
                   safe_float(body.get("yearly_load")), safe_float(body.get("hourly_salary")),
                   safe_float(body.get("monthly_salary")), avg, department_id))
        conn.commit(); conn.close(); return {"updated": department_id, "avg_hourly_rate": avg}
    except Exception as e: raise HTTPException(500, str(e))

@app.delete("/departments/{department_id}")
def delete_department(department_id: int):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("DELETE FROM departments WHERE department_id=?", (department_id,))
        conn.commit(); conn.close(); return {"deleted": department_id}
    except Exception as e: raise HTTPException(500, str(e))

@app.delete("/departments")
def delete_all_departments():
    try:
        conn=get_conn(); c=conn.cursor(); c.execute("DELETE FROM departments")
        conn.commit(); conn.close(); return {"deleted": "all"}
    except Exception as e: raise HTTPException(500, str(e))

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
        conn.commit(); conn.close(); return {"inserted": True}
    except Exception as e: raise HTTPException(500, str(e))

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
        conn.commit(); conn.close(); return {"imported": count}
    except Exception as e: raise HTTPException(500, str(e))

@app.put("/groups/{group_id}")
def update_group(group_id: int, body: dict):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("UPDATE groups SET group_name=?,group_code=?,degree=?,edu_type=?,student_count=?,paid_edu_count=?,free_edu_count=?,tuition_fee=?,prof_id=?,department_id=? WHERE group_id=?",
                  (body.get("group_name"), body.get("group_code"), body.get("degree"), body.get("edu_type"),
                   safe_int(body.get("student_count")) or 0, safe_int(body.get("paid_edu_count")) or 0,
                   safe_int(body.get("free_edu_count")) or 0, safe_float(body.get("tuition_fee")) or 0,
                   safe_int(body.get("prof_id")), safe_int(body.get("department_id")), group_id))
        conn.commit(); conn.close(); return {"updated": group_id}
    except Exception as e: raise HTTPException(500, str(e))

@app.delete("/groups/{group_id}")
def delete_group(group_id: int):
    try:
        conn=get_conn(); c=conn.cursor(); c.execute("DELETE FROM groups WHERE group_id=?", (group_id,))
        conn.commit(); conn.close(); return {"deleted": group_id}
    except Exception as e: raise HTTPException(500, str(e))

@app.delete("/groups")
def delete_all_groups():
    try:
        conn=get_conn(); c=conn.cursor(); c.execute("DELETE FROM groups")
        conn.commit(); conn.close(); return {"deleted": "all"}
    except Exception as e: raise HTTPException(500, str(e))

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
        c.execute("INSERT INTO subjects (subject_name, department_id) OUTPUT INSERTED.subject_id VALUES (?,?)", (body.get("subject_name"), safe_int(body.get("department_id"))))
        row = c.fetchone()
        new_id = row[0] if row else None
        if new_id and (s1 or s2):
            c.execute("INSERT INTO Subject_Group (subject_id,hours_sem1,hours_sem2,hours_yearly) VALUES (?,?,?,?)", (new_id, s1, s2, s1+s2))
        conn.commit(); conn.close(); return {"inserted": True}
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/subjects/import")
async def import_subjects(file: UploadFile = File(...)):
    try:
        rows = await read_upload(file); conn=get_conn(); c=conn.cursor(); count=0
        for row in rows:
            s1 = safe_float(row.get("hours_sem1")) or 0
            s2 = safe_float(row.get("hours_sem2")) or 0
            c.execute("INSERT INTO subjects (subject_name,department_id) OUTPUT INSERTED.subject_id VALUES (?,?)", (row.get("subject_name",""), safe_int(row.get("department_id"))))
            inserted = c.fetchone()
            new_id = inserted[0] if inserted else None
            if new_id and (s1 or s2):
                c.execute("INSERT INTO Subject_Group (subject_id,hours_sem1,hours_sem2,hours_yearly) VALUES (?,?,?,?)", (new_id, s1, s2, s1+s2))
            count += 1
        conn.commit(); conn.close(); return {"imported": count}
    except Exception as e: raise HTTPException(500, str(e))

@app.put("/subjects/{subject_id}")
def update_subject(subject_id: int, body: dict):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("UPDATE subjects SET subject_name=?,department_id=? WHERE subject_id=?", (body.get("subject_name"), safe_int(body.get("department_id")), subject_id))
        conn.commit(); conn.close(); return {"updated": subject_id}
    except Exception as e: raise HTTPException(500, str(e))

@app.delete("/subjects/{subject_id}")
def delete_subject(subject_id: int):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("DELETE FROM Subject_Group WHERE subject_id=?", (subject_id,))
        c.execute("DELETE FROM subjects WHERE subject_id=?", (subject_id,))
        conn.commit(); conn.close(); return {"deleted": subject_id}
    except Exception as e: raise HTTPException(500, str(e))

@app.delete("/subjects")
def delete_all_subjects():
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("DELETE FROM Subject_Group"); c.execute("DELETE FROM subjects")
        conn.commit(); conn.close(); return {"deleted": "all"}
    except Exception as e: raise HTTPException(500, str(e))

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
        conn.commit(); conn.close(); return {"inserted": True}
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/professions/import")
async def import_professions(file: UploadFile = File(...)):
    try:
        rows = await read_upload(file); conn=get_conn(); c=conn.cursor(); count=0
        for row in rows:
            c.execute("INSERT INTO professions (prof_name,institute_id) VALUES (?,?)", (row.get("prof_name",""), safe_int(row.get("institute_id"))))
            count += 1
        conn.commit(); conn.close(); return {"imported": count}
    except Exception as e: raise HTTPException(500, str(e))

@app.put("/professions/{prof_id}")
def update_profession(prof_id: int, body: dict):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("UPDATE professions SET prof_name=?,institute_id=? WHERE prof_id=?", (body.get("prof_name"), safe_int(body.get("institute_id")), prof_id))
        conn.commit(); conn.close(); return {"updated": prof_id}
    except Exception as e: raise HTTPException(500, str(e))

@app.delete("/professions/{prof_id}")
def delete_profession(prof_id: int):
    try:
        conn=get_conn(); c=conn.cursor()
        c.execute("DELETE FROM groups WHERE prof_id=?", (prof_id,))
        c.execute("DELETE FROM professions WHERE prof_id=?", (prof_id,))
        conn.commit(); conn.close(); return {"deleted": prof_id}
    except Exception as e: raise HTTPException(500, str(e))

@app.delete("/professions")
def delete_all_professions():
    try:
        conn=get_conn(); c=conn.cursor(); c.execute("DELETE FROM professions")
        conn.commit(); conn.close(); return {"deleted": "all"}
    except Exception as e: raise HTTPException(500, str(e))

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
    try: query("SELECT 1"); return {"status": "ok", "db": "connected"}
    except: return {"status": "error", "db": "disconnected"}