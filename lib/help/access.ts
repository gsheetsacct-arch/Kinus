import { isDirector, type CurrentUser } from "@/lib/auth/permissions";

/** The Help page: owners, directors, the office and logistics (the people who set Kinus up and print). */
export const canSeeHelp = (u: CurrentUser) => isDirector(u) || u.role === "office" || u.role === "logistics";
