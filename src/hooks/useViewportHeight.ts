import { useEffect, useState } from "react";

/** window.innerHeight, kept current as the URL bar collapses, the keyboard opens or the phone rotates. */
export function useViewportHeight(): number {
  const [height, setHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return height;
}
