"use client";

import { useEffect, useState } from "react";
import { useUiStore } from "@/store/use-ui-store";
import { motion } from "motion/react";

export default function HomePageLoaderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
