import { EnvVars } from "./environment";

export const isProduction = EnvVars.values.SERVER_ENV === "production";
