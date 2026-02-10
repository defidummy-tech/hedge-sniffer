"use client";

import dynamic from "next/dynamic";

// Dynamic import with SSR disabled — the sniffer uses canvas, window, etc.
const Sniffer = dynamic(() => import("./Sniffer"), { ssr: false });

export default function Home() {
  return <Sniffer />;
}
