"use client";
import { createContext, useContext } from "react";
import type { YieldLimits } from "@/lib/services/yields";

// QA's yield limits, for every screen that shows a yield, without passing them through each one.
const YieldLimitsContext = createContext<YieldLimits>({ byProcess: {} });
export const YieldLimitsProvider = YieldLimitsContext.Provider;
export const useYieldLimits = () => useContext(YieldLimitsContext);
