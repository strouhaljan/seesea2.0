import { useEffect, useState } from "react";

export const PHONE_QUERY = "(max-width: 767px)";

/** Current match, for one-off decisions (e.g. initial state). */
export function isPhoneNow(): boolean {
  return window.matchMedia(PHONE_QUERY).matches;
}

/** True on phone-sized screens; follows rotation and resizes. */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(isPhoneNow);
  useEffect(() => {
    const mql = window.matchMedia(PHONE_QUERY);
    const onChange = () => setIsPhone(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isPhone;
}
