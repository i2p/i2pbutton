let EXPORTED_SYMBOLS = [ 'LauncherUtil' ]

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm")

let LauncherUtil = {
  get isMac()
  {
    return LauncherUtilInternal._isMac;
  },

  get isWindows()
  {
    return ("WINNT" == LauncherUtilInternal._OS);
  },

  isAppVersionAtLeast: function(aVersion)
  {
    var appInfo = Cc["@mozilla.org/xre/app-info;1"]
                    .getService(Ci.nsIXULAppInfo);
    var vc = Cc["@mozilla.org/xpcom/version-comparator;1"]
               .getService(Ci.nsIVersionComparator);
    return (vc.compare(appInfo.version, aVersion) >= 0);
  },
}

let LauncherUtilInternal = {
  mOS: '',
  get _OS()
  {
    if (!this.mOS) try
    {
      var xr = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime);
      this.mOS = xr.OS;
    } catch (e) {}

    return this.mOS;
  },

  get _isMac()
  {
    return ("Darwin" == this._OS);
  },
  get _stringBundle()
  {
    if (!this.mStringBundle)
    {
      this.mStringBundle = Cc["@mozilla.org/intl/stringbundle;1"]
                             .getService(Ci.nsIStringBundleService)
                             .createBundle(kPropBundleURI);
    }

    return this.mStringBundle;
  },
  get _dataDir()
  {
    if (!this.mDataDir)
    {
      let ds = Cc["@mozilla.org/file/directory_service;1"]
                      .getService(Ci.nsIProperties);
      let profDir = ds.get("ProfD", Ci.nsIFile);
      this.mDataDir = profDir.parent.parent;
    }

    return this.mDataDir;
  },
}
