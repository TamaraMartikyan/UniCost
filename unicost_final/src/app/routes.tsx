import { createHashRouter } from "react-router";
import Layout from "@/app/components/Layout";
import Dashboard from "@/app/pages/Dashboard";
import Costs from "@/app/pages/Costs";
import Income from "@/app/pages/Income";
import Analytics from "@/app/pages/Analytics";
import Settings from "@/app/pages/Settings";
import { Institutes, Departments, Groups, Subjects, Professions } from "@/app/pages/DataPages";
import { ManageInstitutes, ManageDepartments, ManageGroups, ManageSubjects, ManageProfessions } from "@/app/pages/ManagePages";

export const router = createHashRouter([
    {
        path: "/",
        element: <Layout />,
        children: [
            { index: true, element: <Dashboard /> },
            { path: "costs", element: <Costs /> },
            { path: "income", element: <Income /> },
            { path: "analytics", element: <Analytics /> },
            { path: "institutes", element: <Institutes /> },
            { path: "departments", element: <Departments /> },
            { path: "groups", element: <Groups /> },
            { path: "subjects", element: <Subjects /> },
            { path: "professions", element: <Professions /> },
            { path: "manage/institutes", element: <ManageInstitutes /> },
            { path: "manage/departments", element: <ManageDepartments /> },
            { path: "manage/groups", element: <ManageGroups /> },
            { path: "manage/subjects", element: <ManageSubjects /> },
            { path: "manage/professions", element: <ManageProfessions /> },
            { path: "settings", element: <Settings /> },
        ],
    },
]);