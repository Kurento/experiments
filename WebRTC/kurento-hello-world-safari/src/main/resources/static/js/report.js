function generateFingerprintCode()
{
  let client = new ClientJS();
  return client.getFingerprint();
}

function generateFingerprintText()
{
  let string = "";

  string += "==== Detectizr ====" + "\n";
  Detectizr.detect();
  string += "browser: " + JSON.stringify(Detectizr.browser) + "\n";
  string += "device: " + JSON.stringify(Detectizr.device) + "\n";
  string += "os: " + JSON.stringify(Detectizr.os) + "\n";



  string += "==== PlatformJS ====" + "\n";
  string += "description: " + platform.description + "\n";
  string += "name: " + platform.name + "\n";
  string += "version: " + platform.version + "\n";
  string += "product: " + platform.product + "\n";
  string += "manufacturer: " + platform.manufacturer + "\n";
  string += "layout: " + platform.layout + "\n";
  string += "os: " + platform.os + "\n";



  string += "==== ClientJS ====" + "\n";
  let client = new ClientJS();
  string += "FingerPrint: " + client.getFingerprint() + "\n";
  string += "UserAgent: " + client.getUserAgent() + "\n";
  string += "Browser: " + client.getBrowser() + "\n";
  string += "BrowserVersion: " + client.getBrowserVersion() + "\n";
  string += "BrowserMajorVersion: " + client.getBrowserMajorVersion() + "\n";
  string += "IE: " + client.isIE() + "\n";
  string += "Chrome: " + client.isChrome() + "\n";
  string += "Firefox: " + client.isFirefox() + "\n";
  string += "Safari: " + client.isSafari() + "\n";
  string += "MobileSafari: " + client.isMobileSafari() + "\n";
  string += "Opera: " + client.isOpera() + "\n";
  string += "Engine: " + client.getEngine() + "\n";
  string += "EngineVersion: " + client.getEngineVersion() + "\n";
  string += "OS: " + client.getOS() + "\n";
  string += "OSVersion: " + client.getOSVersion() + "\n";
  string += "Windows: " + client.isWindows() + "\n";
  string += "Mac: " + client.isMac() + "\n";
  string += "Linux: " + client.isLinux() + "\n";
  string += "Ubuntu: " + client.isUbuntu() + "\n";
  string += "Solaris: " + client.isSolaris() + "\n";
  string += "Device: " + client.getDevice() + "\n";
  string += "DeviceType: " + client.getDeviceType() + "\n";
  string += "DeviceVendor: " + client.getDeviceVendor() + "\n";
  string += "CPU: " + client.getCPU() + "\n";
  string += "Mobile: " + client.isMobile() + "\n";
  string += "MobileMajor: " + client.isMobileMajor() + "\n";
  string += "MobileAndroid: " + client.isMobileAndroid() + "\n";
  string += "MobileOpera: " + client.isMobileOpera() + "\n";
  string += "MobileWindows: " + client.isMobileWindows() + "\n";
  string += "MobileBlackBerry: " + client.isMobileBlackBerry() + "\n";
  string += "MobileIOS: " + client.isMobileIOS() + "\n";
  string += "Iphone: " + client.isIphone() + "\n";
  string += "Ipad: " + client.isIpad() + "\n";
  string += "Ipod: " + client.isIpod() + "\n";
  string += "ScreenPrint: " + client.getScreenPrint() + "\n";
  string += "ColorDepth: " + client.getColorDepth() + "\n";
  string += "CurrentResolution: " + client.getCurrentResolution() + "\n";
  string += "AvailableResolution: " + client.getAvailableResolution() + "\n";
  string += "DeviceXDPI: " + client.getDeviceXDPI() + "\n";
  string += "DeviceYDPI: " + client.getDeviceYDPI() + "\n";
  string += "Plugins: " + client.getPlugins() + "\n";
  string += "Java: " + client.isJava() + "\n";
  string += "JavaVersion: " + client.getJavaVersion() + "\n";
  string += "Flash: " + client.isFlash() + "\n";
  string += "FlashVersion: " + client.getFlashVersion() + "\n";
  string += "Silverlight: " + client.isSilverlight() + "\n";
  string += "SilverlightVersion: " + client.getSilverlightVersion() + "\n";
  string += "MimeTypes: " + client.getMimeTypes() + "\n";
  string += "MimeTypes: " + client.isMimeTypes() + "\n";
  string += "Font: " + client.isFont() + "\n";
  string += "Fonts: " + client.getFonts() + "\n";
  string += "LocalStorage: " + client.isLocalStorage() + "\n";
  string += "SessionStorage: " + client.isSessionStorage() + "\n";
  string += "Cookie: " + client.isCookie() + "\n";
  string += "TimeZone: " + client.getTimeZone() + "\n";
  string += "Language: " + client.getLanguage() + "\n";
  string += "SystemLanguage: " + client.getSystemLanguage() + "\n";

  return string;
}
