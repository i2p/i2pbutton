let EXPORTED_SYMBOLS = [ 'LauncherUtil' ]

const Cc = Components.classes
const Ci = Components.interfaces
const Cu = Components.utils
const Cr = Components.results

const kPropBundleURI = "chrome://i2pbutton/locale/i2pbutton.properties"
const kPropNamePrefix = "i2pbutton."

Cu.import("resource://gre/modules/XPCOMUtils.jsm")
//const logger = Cc["@geti2p.net/i2pbutton-logger;1"].getService(Ci.nsISupports).wrappedJSObject
let console = (Cu.import("resource://gre/modules/Console.jsm", {})).console

let logger = {
  log:function(level, message) {
    console.log(message)
  }
}


const LauncherUtil = {
  get isMac()
  {
    return LauncherUtilInternal._isMac
  },

  get isWindows()
  {
    return ("WINNT" == LauncherUtilInternal._OS)
  },

  isAppVersionAtLeast: function(aVersion)
  {
    var appInfo = Cc["@mozilla.org/xre/app-info;1"]
                    .getService(Ci.nsIXULAppInfo);
    var vc = Cc["@mozilla.org/xpcom/version-comparator;1"]
               .getService(Ci.nsIVersionComparator);
    return (vc.compare(appInfo.version, aVersion) >= 0);
  },
  // Error Reporting / Prompting
  showAlert: function(aParentWindow, aMsg)
  {
    // TODO: alert() does not always resize correctly to fit the message.
    try
    {
      if (!aParentWindow)
      {
        var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator)
        let browserWindow = wm.getMostRecentWindow("navigator:browser")
        if (TLUtilInternal._isWindowVisible(browserWindow))
          aParentWindow = browserWindow;
      }

      var ps = Cc["@mozilla.org/embedcomp/prompt-service;1"]
                 .getService(Ci.nsIPromptService);
      var title = this.getLocalizedString("error_title");
      ps.alert(aParentWindow, title, aMsg);
    }
    catch (e)
    {
      alert(aMsg);
    }
  },

  // Returns true if user confirms; false if not.
  // Note that no prompt is shown (and false is returned) if the Network Settings
  // window is open.
  showConfirm: function(aParentWindow, aMsg, aDefaultButtonLabel, aCancelButtonLabel)
  {
    try {
      if (!aParentWindow) {
        var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

        aParentWindow = wm.getMostRecentWindow("navigator:browser");
      }

      var ps = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
      var title = this.getLocalizedString("error_title");
      var btnFlags = (ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING)
      + ps.BUTTON_POS_0_DEFAULT
      + (ps.BUTTON_POS_1 * ps.BUTTON_TITLE_IS_STRING);

      var notUsed = { value: false };
      var btnIndex =  ps.confirmEx(aParentWindow, title, aMsg, btnFlags,
                    aDefaultButtonLabel, aCancelButtonLabel,
                null, null, notUsed);
      return (0 == btnIndex);
    } catch (e) {
      return confirm(aMsg);
    }

    return false
  },

  cleanupTempDirectories: function()
  {
    try
    {
      let dirPath = this.getCharPref(TLUtilInternal.kIPCDirPrefName);
      this.clearUserPref(TLUtilInternal.kIPCDirPrefName);
      if (dirPath)
      {
        let f = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
        f.initWithPath(dirPath);
        if (f.exists())
          f.remove(false); // Remove directory if it is empty
      }
    } catch(e) {}
  },

  getI2PBinary: function() {
    return this.getI2PFile('i2p')
  },

  getI2PFile: function(aI2PFileType, aCreate) {
    if (!aI2PFileType) {
      return false
    }
    let i2pFile
    let path = ''
    let useAppDir = false
    let isRelativePath = true
    let isUserData = (aI2PFileType != 'i2p')

    if (LauncherUtilInternal._isUserDataOutsideOfAppDir) {
      if (this.isWindows) {
        //
        if ("i2p" == aI2PFileType) {
          path = "I2PBrowser\\I2P\\bin\\java"
          useAppDir = true
        } else if ("i2pdatadir" == aI2PFileType) {
          path = "I2P"
        }
      } else if (this.isMac) {
        //
        if ("i2p" == aI2PFileType) {
          path = "Contents/Resources/I2PBrowser/I2P/bin/java"
        } else if ("i2pdatadir" == aI2PFileType) {
          path = "I2P"
        }
      } else {
        if ("i2p" == aI2PFileType) {
          path = "I2PBrowser/I2P/bin/java"
        } else if ("i2pdatadir" == aI2PFileType) {
          path = "I2P"
        }
      }
    } else if (this.isWindows) { // if (LauncherUtilInternal._isUserDataOutsideOfAppDir)
      if ("i2p" == aI2PFileType) {
        path = "I2P\\bin\\java"
        useAppDir = true
      } else if ("i2pdatadir" == aI2PFileType) {
        path = "Data\\I2P"
      }
    } else {
      if ("i2p" == aI2PFileType) {
        path = "I2P/bin/java"
        useAppDir = true
      } else if ("i2pdatadir" == aI2PFileType) {
        path = "Data/I2P"
      }
    }

    logger.log(2, `getI2PFile - Gonna try path ${path}`)
    try {
      if (path == '' && !useAppDir) {
        throw Error('Fatal error: Can\'t resolve directories!')
      }
      if (useAppDir)
      {
        i2pFile = LauncherUtilInternal._appDir.clone()
      }

      // Turn 'path' into an absolute path.
      if (LauncherUtilInternal._isUserDataOutsideOfAppDir)
      {
        let baseDir = isUserData ? LauncherUtilInternal._dataDir : LauncherUtilInternal._appDir
        i2pFile = baseDir.clone()
      } else {
        i2pFile = LauncherUtilInternal._appDir.clone()
        i2pFile.append("I2PBrowser")
      }
      i2pFile.appendRelativePath(path)

      if (!i2pFile.exists() && aCreate === true) {
        logger.log(3, `Requested datadir ${i2pFile.path}, but it wasn't created so we create it now.`)
        i2pFile.create(i2pFile.DIRECTORY_TYPE, 0o700)
      }

      if (i2pFile.exists()) {
        try { i2pFile.normalize() } catch(e) {}
        logger.log(3, `Decided to use file ${i2pFile.path}`)
        return i2pFile
      } else {
        logger.log(4, aI2PFileType + " file not found: "+ i2pFile.path)
        return ''
      }

    } catch(e) {
      logger.log(4, `getI2PFile ${aI2PFileType} failed for ${path}: ${e}`)
      return null
    }

  },
  get internal() {
    return LauncherUtilInternal
  },
  get dataDirectoryObject() {
    return LauncherUtilInternal._dataDir
  },
  get appDirectoryObject() {
    return LauncherUtilInternal._appDir
  },
  flushLocalizedStringCache: function()
  {
    LauncherUtilInternal.mStringBundle = undefined
  },
  // "i2pbutton." is prepended to aStringName.
  getLocalizedString: function(aStringName)
  {
    if (!aStringName)
      return aStringName;

    try
    {
      var key = kPropNamePrefix + aStringName;
      return TLUtilInternal._stringBundle.GetStringFromName(key);
    } catch(e) {}

    return aStringName;
  },

  // "i2pbutton." is prepended to aStringName.
  getFormattedLocalizedString: function(aStringName, aArray, aLen)
  {
    if (!aStringName || !aArray)
      return aStringName;

    try
    {
      var key = kPropNamePrefix + aStringName;
      return TLUtilInternal._stringBundle.formatStringFromName(key,
                                                               aArray, aLen);
    } catch(e) {}

    return aStringName;
  },

  getLocalizedStringForError: function(aNSResult)
  {
    for (let prop in Cr)
    {
      if (Cr[prop] == aNSResult)
      {
        let key = "nsresult." + prop;
        let rv = this.getLocalizedString(key);
        if (rv !== key)
          return rv;

        return prop;  // As a fallback, return the NS_ERROR... name.
      }
    }

    return undefined;
  },
}

Object.freeze(LauncherUtil)

let LauncherUtilInternal = {
  kThunderbirdID: "{3550f703-e582-4d05-9a08-453d09bdfdc6}",
  kInstantbirdID: "{33cb9019-c295-46dd-be21-8c4936574bee}",

  mOS: '',
  mStringBundle : null,
  mPrefsSvc : null,
  mAppDir: null,        // nsIFile (cached; access via this._appDir)
  mDataDir: null,       // nsIFile (cached; access via this._dataDir)
  mIsUserDataOutsideOfAppDir: undefined,

  _init: function() {
    // Init
    this.mPrefsSvc = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch)
    this._appDir
    this._dataDir
  },

  get _OS()
  {
    if (!this.mOS) try
    {
      const xr = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime)
      this.mOS = xr.OS
    } catch (e) {}

    return this.mOS
  },

  get _isMac()
  {
    return ("Darwin" == this._OS)
  },
  get _stringBundle()
  {
    if (!this.mStringBundle)
    {
      this.mStringBundle = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService).createBundle(kPropBundleURI)
    }

    return this.mStringBundle;
  },

  get _isUserDataOutsideOfAppDir() {
    if (this.mIsUserDataOutsideOfAppDir == undefined) {
      // Determine if we are using a "side-by-side" data model by checking
      // whether the user profile is outside of the app directory.
      try {
        let ds = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties)
        let profDir = ds.get("ProfD", Ci.nsIFile)
        this.mIsUserDataOutsideOfAppDir = !this._appDir.contains(profDir);
      } catch (e) {
        this.mIsUserDataOutsideOfAppDir = false;
      }
    }

    return this.mIsUserDataOutsideOfAppDir;
  }, // get _isUserDataOutsideOfAppDir

  // Returns an nsIFile that points to the application directory.
  // May throw.
  get _appDir() {
    if (!this.mAppDir) {
      let topDir = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("CurProcD", Ci.nsIFile)
      let appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo)
      // On Linux and Windows, we want to return the Browser/ directory.
      // Because topDir ("CurProcD") points to Browser/browser on those
      // platforms, we need to go up one level.
      // On Mac OS, we want to return the I2PBrowser.app/ directory.
      // Because topDir points to Contents/Resources/browser on Mac OS,
      // we need to go up 3 levels.
      let i2bbBrowserDepth = (this._isMac) ? 3 : 1;
      if ((appInfo.ID == this.kThunderbirdID) ||
          (appInfo.ID == this.kInstantbirdID)) {
        // On Thunderbird/Instantbird, the topDir is the root dir and not
        // browser/, so we need to iterate one level less than Firefox.
        --i2bbBrowserDepth;
      }

      while (i2bbBrowserDepth > 0) {
        let didRemove = (topDir.leafName != ".")
        topDir = topDir.parent
        if (didRemove)
          i2bbBrowserDepth--
      }

      this.mAppDir = topDir
    }

    return this.mAppDir
  }, // get _appDir

  // Returns an nsIFile that points to the I2PBrowser-Data/ directory.
  // This function is only used when this._isUserDataOutsideOfAppDir == true.
  // May throw.
  get _dataDir() {
    if (!this.mDataDir) {
      let ds = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties)
      let profDir = ds.get("ProfD", Ci.nsIFile)
      this.mDataDir = profDir.parent.parent
    }
    return this.mDataDir
  }, // get _dataDir

  _isWindowVisible: function(aWindow) {
    if (!aWindow)
      return false

    try {
      let winUtils = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils)
      return winUtils.isParentWindowMainWidgetVisible
    } catch(e) {}

    return false
  },
}

LauncherUtilInternal._init()

