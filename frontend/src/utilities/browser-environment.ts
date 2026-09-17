interface BrowserEnvironment {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone?: boolean;
}

// iPadOS can report a desktop Mac identity. Touch support distinguishes that
// case from a Mac browser. Keep this narrow platform exception in one place.
export function isIOSStandalone(environment: BrowserEnvironment, standaloneDisplay: boolean): boolean {
  const ios = /iPad|iPhone|iPod/.test(environment.userAgent) ||
    (/Mac/.test(environment.platform) && environment.maxTouchPoints > 1);
  return ios && (environment.standalone === true || standaloneDisplay);
}
