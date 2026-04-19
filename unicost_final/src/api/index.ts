const BASE = "http://localhost:8001";

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export const getInstitutes  = () => get("/institutes");
export const getDepartments = () => get("/departments");
export const getGroups      = () => get("/groups");
export const getSubjects    = () => get("/subjects");
export const getProfessions = () => get("/professions");

export const getCostComponents    = (id?: number) => get(`/costs/components${id    ? `?institute_id=${id}` : ""}`);
export const getLecturerSalary    = (id?: number) => get(`/costs/lecturer-salary${id ? `?institute_id=${id}` : ""}`);
export const getVariableAllowance = (id?: number) => get(`/costs/variable-allowance${id ? `?institute_id=${id}` : ""}`);
export const getFixedAllowance    = (id?: number) => get(`/costs/fixed-allowance${id ? `?institute_id=${id}` : ""}`);
export const getUtilityCost       = (id?: number) => get(`/costs/utility-cost${id  ? `?institute_id=${id}` : ""}`);
export const getOtherCosts        = (id?: number) => get(`/costs/other-costs${id   ? `?institute_id=${id}` : ""}`);
export const getAllCosts           = (id?: number) => get(`/costs/all-costs${id     ? `?institute_id=${id}` : ""}`);

export const getIncome = (level: string = "institute", id?: number) =>
  get(`/income?level=${level}${id ? `&institute_id=${id}` : ""}`);