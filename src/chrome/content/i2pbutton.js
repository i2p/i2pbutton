let { Services } = Cu.import("resource://gre/modules/Services.jsm", {})
const {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm")

//let SecurityPrefs  = Cu.import("resource://i2pbutton/modules/security-prefs.js", {})

var m_ib_prefs = Services.prefs
var m_ib_domWindowUtils = window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils)

const k_ib_last_browser_version_pref = "extensions.i2pbutton.lastBrowserVersion";
const k_ib_browser_update_needed_pref = "extensions.i2pbutton.updateNeeded";
const k_ib_last_update_check_pref = "extensions.i2pbutton.lastUpdateCheck";

var m_ib_is_initialized = false
var m_ib_is_router_running = false
var m_ib_browser_router = false
var m_ib_ibb = false
var m_ib_is_main_window = false
var m_ib_confirming_plugins = false

var m_ib_window_height = window.outerHeight
var m_ib_window_width = window.outerWidth


function checkI2P(callback,proxyCallback) {
  let checkSvc = Cc["@geti2p.net/i2pbutton-i2pCheckService;1"].getService(Ci.nsISupports).wrappedJSObject;
  let req = checkSvc.createCheckConsoleRequest(true);
  req.onreadystatechange = function(event) {
    if (req.readyState === 4) {
      // Done
      let result = checkSvc.parseCheckConsoleResponse(req)
      i2pbutton_log(3, "I2P Console check done. Result: " + result)
      callback(result)
    }
  }
  req.send(null)

  let proxyReq = checkSvc.createCheckProxyRequest(true)
  proxyReq.onreadystatechange = function (event) {
    if (proxyReq.readyState === 4) {
      let result = checkSvc.parseCheckProxyResponse(proxyReq)
      i2pbutton_log(3, "I2P Proxy check done. Result: " + result)
      proxyCallback(result)
    }
  }
  proxyReq.send(null)
}

function i2pbutton_i2p_check_ok()
{
  let checkSvc = Cc["@geti2p.net/i2pbutton-i2pCheckService;1"].getService(Ci.nsISupports).wrappedJSObject
  // It's important to check both if failed and if it's initialised to not report wrong to the end user
  return (checkSvc.isConsoleWorking && checkSvc.isProxyWorking && checkSvc.kCheckNotInitiated != checkSvc.statusOfI2PCheck)
}
function i2pbutton_i2p_console_check_ok()
{
  let checkSvc = Cc["@geti2p.net/i2pbutton-i2pCheckService;1"].getService(Ci.nsISupports).wrappedJSObject
  // It's important to check both if failed and if it's initialised to not report wrong to the end user
  return (checkSvc.isConsoleWorking && checkSvc.kCheckNotInitiated != checkSvc.statusOfI2PCheck)
}

var i2pbutton_unique_pref_observer =
{
  register: function()
  {
    this.forced_ua = false;
    m_ib_prefs.addObserver("extensions.i2pbutton", this, false);
    m_ib_prefs.addObserver("network.cookie", this, false);
    m_ib_prefs.addObserver("browser.privatebrowsing.autostart", this, false);
    m_ib_prefs.addObserver("javascript", this, false);
    m_ib_prefs.addObserver("plugin.disable", this, false);
    m_ib_prefs.addObserver("privacy.firstparty.isolate", this, false);
    m_ib_prefs.addObserver("privacy.resistFingerprinting", this, false);

    // We observe xpcom-category-entry-added for plugins w/ Gecko-Content-Viewers
    var observerService = Cc["@mozilla.org/observer-service;1"].
        getService(Ci.nsIObserverService);
    observerService.addObserver(this, "xpcom-category-entry-added", false);
  },

  unregister: function()
  {
    m_ib_prefs.removeObserver("extensions.i2pbutton", this);
    m_ib_prefs.removeObserver("network.cookie", this);
    m_ib_prefs.removeObserver("browser.privatebrowsing.autostart", this);
    m_ib_prefs.removeObserver("javascript", this);
    m_ib_prefs.removeObserver("plugin.disable", this);
    m_ib_prefs.removeObserver("privacy.firstparty.isolate", this);
    m_ib_prefs.removeObserver("privacy.resistFingerprinting", this);

    var observerService = Cc["@mozilla.org/observer-service;1"].
        getService(Ci.nsIObserverService);
    observerService.removeObserver(this, "xpcom-category-entry-added");
  },

  // topic:   what event occurred
  // subject: what nsIPrefBranch we're observing
  // data:    which pref has been changed (relative to subject)
  observe: function(subject, topic, data)
  {
    if (topic == "xpcom-category-entry-added") {
      // Hrmm. should we inspect subject too? it's just mime type..
      subject.QueryInterface(Ci.nsISupportsCString);
      if (data == "Gecko-Content-Viewers" &&
        !m_ib_prefs.getBoolPref("extensions.i2pbutton.startup") &&
        m_ib_prefs.getBoolPref("extensions.i2pbutton.confirm_plugins")) {
        i2pbutton_log(3, "Got plugin enabled notification: "+subject);

        /* We need to protect this call with a flag becuase we can
        * get multiple observer events for each mime type a plugin
        * registers. Thankfully, these notifications arrive only on
        * the main thread, *however*, our confirmation dialog suspends
        * execution and allows more events to arrive until it is answered
        */
        if (!m_ib_confirming_plugins) {
          m_ib_confirming_plugins = true;
          i2pbutton_confirm_plugins();
          m_ib_confirming_plugins = false;
        } else {
          i2pbutton_log(3, "Skipping notification for mime type: "+subject);
        }
      }
      return;
    }

    if (topic != "nsPref:changed") return;

    switch (data) {
      case "plugin.disable":
        i2pbutton_toggle_plugins(m_ib_prefs.getBoolPref("plugin.disable"));
        break;
      case "browser.privatebrowsing.autostart":
        i2pbutton_update_disk_prefs();
        break;
      case "extensions.i2pbutton.use_noni2p_proxy":
        i2pbutton_use_noni2p_proxy();
        break;
      case "privacy.resistFingerprinting":
        i2pbutton_update_fingerprinting_prefs();
        break;
    }
  }
}

// For some odd reason, this fails if it's defined with let/const and must be var.
var i2pbutton_abouti2p_message_handler = {
  // Receive IPC messages from the about:i2p content script.
  receiveMessage: function(aMessage) {
    switch(aMessage.name) {
      case "AboutI2p:Loaded":
        aMessage.target.messageManager.sendAsyncMessage("AboutI2p:ChromeData",
                                                    this.getChromeData(true));
        break;
    }
  },

  // Send privileged data to all of the about:tor content scripts.
  updateAllOpenPages: function() {
    window.messageManager.broadcastAsyncMessage("AboutI2p:ChromeData",
                                                this.getChromeData(false));
  },

  // The chrome data contains all of the data needed by the about:i2p
  // content process that is only available here (in the chrome process).
  // It is sent to the content process when an about:i2p window is opened
  // and in response to events such as the browser noticing that I2P is
  // not working.
  getChromeData: function(aIsRespondingToPageLoad) {
    let dataObj = {
      updateChannel: AppConstants.MOZ_UPDATE_CHANNEL,
      i2pOn: i2pbutton_i2p_check_ok(),
      i2pConsoleOn: i2pbutton_i2p_console_check_ok()
    };

    if (aIsRespondingToPageLoad) {
      const kShouldNotifyPref = "i2pbrowser.post_update.shouldNotify";
      if (m_ib_prefs.getBoolPref(kShouldNotifyPref, false)) {
        m_ib_prefs.clearUserPref(kShouldNotifyPref);
        dataObj.hasBeenUpdated = true;
        dataObj.updateMoreInfoURL = this.getUpdateMoreInfoURL();
      }
    }

    return dataObj;
  },

  getUpdateMoreInfoURL: function() {
    try {
      return Services.prefs.getCharPref("i2pbrowser.post_update.url");
    } catch (e) {}

    // Use the default URL as a fallback.
    return Services.urlFormatter.formatURLPref("startup.homepage_override_url");
  }
};

function i2pbutton_is_mobile() {
  return false;
}



// This function closes all XUL browser windows except this one. For this
// window, it closes all existing tabs and creates one about:blank tab.
function i2pbutton_close_tabs_on_new_identity() {
  if (!m_ib_prefs.getBoolPref("extensions.i2pbutton.close_newnym", true)) {
    i2pbutton_log(3, "Not closing tabs");
    return;
  }

  // TODO: muck around with browser.tabs.warnOnClose.. maybe..
  i2pbutton_log(3, "Closing tabs...");
  let wm = Cc["@mozilla.org/appshell/window-mediator;1"]
             .getService(Ci.nsIWindowMediator);
  let enumerator = wm.getEnumerator("navigator:browser");
  let windowsToClose = new Array();
  while (enumerator.hasMoreElements()) {
    let win = enumerator.getNext();
    let browser = win.getBrowser();
    if (!browser) {
      i2pbutton_log(5, "No browser for possible closed window");
      continue;
    }

    let tabCount = browser.browsers.length;
    i2pbutton_log(3, "Tab count for window: " + tabCount);
    let tabsToRemove = new Array();
    for (let i = 0; i < tabCount; i++) {
      let tab = browser.getTabForBrowser(browser.browsers[i]);
      if (!tab) {
        i2pbutton_log(5, "No tab for browser");
      } else {
        tabsToRemove.push(tab);
      }
    }

    if (win == window) {
      browser.addTab("about:blank");
    } else {
      // It is a bad idea to alter the window list while iterating
      // over it, so add this window to an array and close it later.
      windowsToClose.push(win);
    }

    // Close each tab except the new blank one that we created.
    tabsToRemove.forEach(aTab => browser.removeTab(aTab));
  }

  // Close all XUL windows except this one.
  i2pbutton_log(2, "Closing windows...");
  windowsToClose.forEach(aWin => aWin.close());

  i2pbutton_log(3, "Closed all tabs");
}

function i2pbutton_confirm_plugins() {
  var any_plugins_enabled = false;
  var PH=Cc["@mozilla.org/plugin/host;1"].getService(Ci.nsIPluginHost);
  var P=PH.getPluginTags({});
  for(var i=0; i<P.length; i++) {
      if (!P[i].disabled)
        any_plugins_enabled = true;
  }

  if (!any_plugins_enabled) {
    i2pbutton_log(3, "False positive on plugin notification. Ignoring");
    return;
  }

  i2pbutton_log(3, "Confirming plugin usage.");

  var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
      .getService(Components.interfaces.nsIPromptService);

  // Display two buttons, both with string titles.
  var flags = prompts.STD_YES_NO_BUTTONS + prompts.BUTTON_DELAY_ENABLE;

  var message = i2pbutton_get_property_string("i2pbutton.popup.confirm_plugins");
  var askAgainText = i2pbutton_get_property_string("i2pbutton.popup.never_ask_again");
  var askAgain = {value: false};

  var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
             .getService(Components.interfaces.nsIWindowMediator);
  var win = wm.getMostRecentWindow("navigator:browser");
  var no_plugins = (prompts.confirmEx(win, "", message, flags, null, null, null,
      askAgainText, askAgain) == 1);

  m_ib_prefs.setBoolPref("extensions.i2pbutton.confirm_plugins", !askAgain.value);

  // The pref observer for "plugin.disable" will set the appropriate plugin state.
  // So, we only touch the pref if it has changed.
  if (no_plugins !=
      m_ib_prefs.getBoolPref("plugin.disable"))
    m_ib_prefs.setBoolPref("plugin.disable", no_plugins);
  else
  i2pbutton_toggle_plugins(no_plugins);

  // Now, if any tabs were open to about:addons, reload them. Our popup
  // messed up that page.
  var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                     .getService(Components.interfaces.nsIWindowMediator);
  var browserEnumerator = wm.getEnumerator("navigator:browser");

  // Check each browser instance for our URL
  while (browserEnumerator.hasMoreElements()) {
    var browserWin = browserEnumerator.getNext();
    var tabbrowser = browserWin.gBrowser;

    // Check each tab of this browser instance
    var numTabs = tabbrowser.browsers.length;
    for (var index = 0; index < numTabs; index++) {
      var currentBrowser = tabbrowser.getBrowserAtIndex(index);
      if ("about:addons" == currentBrowser.currentURI.spec) {
        i2pbutton_log(3, "Got browser: "+currentBrowser.currentURI.spec);
        currentBrowser.reload();
      }
    }
  }
}


function i2pbutton_inform_about_ibb() {
  var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
      .getService(Components.interfaces.nsIPromptService);

  var message = i2pbutton_get_property_string("i2pbutton.popup.prompt_i2pbrowser");
  var title = i2pbutton_get_property_string("i2pbutton.title.prompt_i2pbrowser");
  var checkbox = {value: false};

  var sb = Components.classes["@mozilla.org/intl/stringbundle;1"]
      .getService(Components.interfaces.nsIStringBundleService);
  var browserstrings = sb.createBundle("chrome://browser/locale/browser.properties");

  var askagain = browserstrings.GetStringFromName("privateBrowsingNeverAsk");

  var response = prompts.alertCheck(null, title, message, askagain, checkbox);

  // Update preferences to reflect their response and to prevent the prompt from
  // being displayed again.
  m_ib_prefs.setBoolPref("extensions.i2pbutton.prompt_i2pbrowser", !checkbox.value);
}

function i2pbutton_check_protections()
{
  var env = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);

  // Bug 21091: check for the existence of an environment variable
  // in order to toggle the visibility of the i2pbutton-checkForUpdate
  // menuitem and its separator.
  if (env.exists("I2P_HIDE_UPDATE_CHECK_UI")) {
    document.getElementById("i2pbutton-checkForUpdateSeparator").hidden = true;
    document.getElementById("i2pbutton-checkForUpdate").hidden = true;
  } else {
    document.getElementById("i2pbutton-checkForUpdateSeparator").hidden = false;
    document.getElementById("i2pbutton-checkForUpdate").hidden = false;
  }

  var cookie_pref = m_ib_prefs.getBoolPref("extensions.i2pbutton.cookie_protections", true);
  document.getElementById("i2pbutton-cookie-protector").disabled = !cookie_pref;

  // XXX: Bug 14632: The cookie dialog is useless in private browsing mode in FF31ESR
  // See https://trac.torproject.org/projects/tor/ticket/10353 for more info.
  document.getElementById("i2pbutton-cookie-protector").hidden = m_ib_prefs.getBoolPref("browser.privatebrowsing.autostart");

  if (/*!m_ib_ibb &&*/ m_ib_prefs.getBoolPref("extensions.i2pbutton.prompt_i2pbrowser")) {
      i2pbutton_inform_about_ibb();
  }
}

function i2pbutton_check_for_update() {
  // Open the update prompt in the correct mode.  The update state
  // checks used here were adapted from isPending() and isApplied() in
  // Mozilla's browser/base/content/aboutDialog.js code.
  let updateMgr = Cc["@mozilla.org/updates/update-manager;1"].getService(Ci.nsIUpdateManager);
  let update = updateMgr.activeUpdate;
  let updateState = (update) ? update.state : undefined;
  let pendingStates = [ "pending", "pending-service", "applied", "applied-service" ];
  let isPending = (updateState && (pendingStates.indexOf(updateState) >= 0));

  let prompter = Cc["@mozilla.org/updates/update-prompt;1"].createInstance(Ci.nsIUpdatePrompt);
  if (isPending)
    prompter.showUpdateDownloaded(update, false);
  else
    prompter.checkForUpdates();
}

function i2pbutton_open_cookie_dialog() {
  showDialog(window, 'chrome://i2pbutton/content/i2pcookiedialog.xul',
             'Cookie Protections', 'centerscreen,chrome,dialog,modal,resizable');
}

// -------------- HISTORY & COOKIES ---------------------

// Bug 1506 P4: Used by New Identity if cookie protections are
// not in use.
function i2pbutton_clear_cookies() {
    i2pbutton_log(2, 'called i2pbutton_clear_cookies');
    var cm = Components.classes["@mozilla.org/cookiemanager;1"].getService(Components.interfaces.nsICookieManager);
    cm.removeAll();
}


function i2pbutton_new_identity() {
  try {
    // Make sure that we can only click once on New Identiy to avoid race
    // conditions leading to failures (see bug 11783 for an example).
    // TODO: Remove the i2pbutton menu entry again once we have done our
    // security control redesign.
    document.getElementById("i2pbutton-new-identity").disabled = true;
    document.getElementById("menu_newIdentity").disabled = true;
    document.getElementById("appMenuNewIdentity").disabled = true;

    let shouldConfirm =  m_ib_prefs.getBoolPref("extensions.i2pbutton.confirm_newnym");

    if (shouldConfirm) {
      let prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
                      .getService(Ci.nsIPromptService);

      // Display two buttons, both with string titles.
      let flags = prompts.STD_YES_NO_BUTTONS;

      let message = i2pbutton_get_property_string("i2pbutton.popup.confirm_newnym");
      let askAgainText = i2pbutton_get_property_string("i2pbutton.popup.never_ask_again");
      let askAgain = {value: false};

      let confirmed = (prompts.confirmEx(null, "", message, flags, null, null, null,
          askAgainText, askAgain) == 0);

      m_ib_prefs.setBoolPref("extensions.i2pbutton.confirm_newnym", !askAgain.value);

      if (confirmed) {
        i2pbutton_do_new_identity();
      } else {
        // TODO: Remove the i2pbutton menu entry again once we have done our
        // security control redesign.
        document.getElementById("i2pbutton-new-identity").disabled = false;
        document.getElementById("menu_newIdentity").disabled = false;
        document.getElementById("appMenuNewIdentity").disabled = false;
      }
    } else {
        i2pbutton_do_new_identity();
    }
  } catch(e) {
    // If something went wrong make sure we have the New Identity button
    // enabled (again).
    // TODO: Remove the i2pbutton menu entry again once we have done our
    // security control redesign.
    document.getElementById("i2pbutton-new-identity").disabled = false;
    document.getElementById("menu_newIdentity").disabled = false;
    document.getElementById("appMenuNewIdentity").disabled = false;
    i2pbutton_log(5, "Unexpected error on new identity: "+e);
    window.alert("i2pbutton: Unexpected error on new identity: "+e);
  }
}

function i2pbutton_do_new_identity() {
  var obsSvc = Components.classes["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
  // This is todo.
  //i2pbutton_log(3, "New Identity: Disabling JS");
  //i2pbutton_disable_all_js();

  m_ib_prefs.setBoolPref("browser.zoom.siteSpecific", !m_ib_prefs.getBoolPref("browser.zoom.siteSpecific", true));
  m_ib_prefs.setBoolPref("browser.zoom.siteSpecific", !m_ib_prefs.getBoolPref("browser.zoom.siteSpecific", true));

  try {
    if(m_ib_prefs.prefHasUserValue("geo.wifi.access_token")) {
      m_ib_prefs.clearUserPref("geo.wifi.access_token");
    }
  } catch(e) {
    i2pbutton_log(3, "Exception on wifi token clear: "+e);
  }

  try {
    if(m_ib_prefs.prefHasUserValue("general.open_location.last_url")) {
      m_ib_prefs.clearUserPref("general.open_location.last_url");
    }
  } catch(e) {
    i2pbutton_log(3, "Exception on clearing last opened location: "+e);
  }

  i2pbutton_log(3, "New Identity: Closing tabs and clearing searchbox");

  i2pbutton_close_tabs_on_new_identity();

  // Bug #10800: Trying to clear search/find can cause exceptions
  // in unknown cases. Just log for now.
  try {
    var searchBar = window.document.getElementById("searchbar");
    if (searchBar)
      searchBar.textbox.reset();
  } catch(e) {
    i2pbutton_log(5, "New Identity: Exception on clearing search box: "+e);
  }

  try {
    if (gFindBarInitialized) {
      var findbox = gFindBar.getElement("findbar-textbox");
      findbox.reset();
      gFindBar.close();
    }
  } catch(e) {
    i2pbutton_log(5, "New Identity: Exception on clearing find bar: "+e);
  }

  i2pbutton_log(3, "New Identity: Emitting Private Browsing Session clear event");
  obsSvc.notifyObservers(null, "browser:purge-session-history", "");

  i2pbutton_log(3, "New Identity: Clearing HTTP Auth");

  if(m_ib_prefs.getBoolPref('extensions.i2pbutton.clear_http_auth', true)) {
    var auth = Components.classes["@mozilla.org/network/http-auth-manager;1"].getService(Components.interfaces.nsIHttpAuthManager);
    auth.clearAll();
  }

  i2pbutton_log(3, "New Identity: Clearing Crypto Tokens");

  // Clear all crypto auth tokens. This includes calls to PK11_LogoutAll(),
  // nsNSSComponent::LogoutAuthenticatedPK11() and clearing the SSL session
  // cache.
  let sdr = Components.classes["@mozilla.org/security/sdr;1"].getService(Components.interfaces.nsISecretDecoderRing);
  sdr.logoutAndTeardown();

  // This clears the OCSP cache.
  //
  // nsNSSComponent::Observe() watches security.OCSP.enabled, which calls
  // setValidationOptions(), which in turn calls setNonPkixOcspEnabled() which,
  // if security.OCSP.enabled is set to 0, calls CERT_DisableOCSPChecking(),
  // which calls CERT_ClearOCSPCache().
  // See: https://mxr.mozilla.org/comm-esr24/source/mozilla/security/manager/ssl/src/nsNSSComponent.cpp
  var ocsp = m_ib_prefs.getIntPref("security.OCSP.enabled");
  m_ib_prefs.setIntPref("security.OCSP.enabled", 0);
  m_ib_prefs.setIntPref("security.OCSP.enabled", ocsp);

  // This clears the site permissions on I2P Browser
  // XXX: Tie to some kind of disk-ok pref?
  try {
    Services.perms.removeAll();
  } catch(e) {
    // Actually, this catch does not appear to be needed. Leaving it in for
    // safety though.
    i2pbutton_log(3, "Can't clear permissions: Not I2P Browser: "+e);
  }

   // Clear site security settings
   let sss = Cc["@mozilla.org/ssservice;1"].getService(Ci.nsISiteSecurityService);
   sss.clearAll();

  // This clears the undo tab history.
  var tabs = m_ib_prefs.getIntPref("browser.sessionstore.max_tabs_undo");
  m_ib_prefs.setIntPref("browser.sessionstore.max_tabs_undo", 0);
  m_ib_prefs.setIntPref("browser.sessionstore.max_tabs_undo", tabs);

  i2pbutton_log(3, "New Identity: Clearing Image Cache");
  i2pbutton_clear_image_caches();

  i2pbutton_log(3, "New Identity: Clearing Offline Cache");

  try {
    const LoadContextInfo = Cc["@mozilla.org/load-context-info-factory;1"].getService(Ci.nsILoadContextInfoFactory);

    for (let contextInfo of [LoadContextInfo.default, LoadContextInfo.private]) {
      let appCacheStorage = Services.cache2.appCacheStorage(contextInfo, null);
      // The following call (asyncEvictStorage) is actually synchronous, either
      // if we have pref "browser.cache.use_new_backend" -> 1 or
      // "browser.cache.use_new_backend_temp" -> true,
      // then we are using the new cache (cache2) which operates synchronously.
      // If we are using the old cache, then the tor-browser.git patch for
      // #5715 also makes this synchronous. So we pass a null callback.
      try {
        appCacheStorage.asyncEvictStorage(null);
      } catch (err) {
         // We ignore "not available" errors because they occur if a cache
         // has not been used, e.g., if no browsing has been done.
         if (err.name !== 'NS_ERROR_NOT_AVAILABLE') {
             throw err;
         }
      }
    }
  } catch(e) {
    i2pbutton_log(5, "Exception on cache clearing: "+e);
    window.alert("i2pbutton: Unexpected error during offline cache clearing: "+e);
  }

  i2pbutton_log(3, "New Identity: Clearing Disk and Memory Caches");

  try {
    Services.cache2.clear();
  } catch(e) {
    i2pbutton_log(5, "Exception on cache clearing: "+e);
    window.alert("i2pbutton: Unexpected error during cache clearing: "+e);
  }

  i2pbutton_log(3, "New Identity: Clearing storage");

  let orig_quota_test = m_ib_prefs.getBoolPref("dom.quotaManager.testing", true);
  try {
    // This works only by setting the pref to `true` otherwise we get an
    // exception and nothing is happening.
    m_ib_prefs.setBoolPref("dom.quotaManager.testing", true);
    Cc["@mozilla.org/dom/quota-manager-service;1"].getService(Ci.nsIQuotaManagerService).clear();
  } catch(e) {
    i2pbutton_log(5, "Exception on storage clearing: "+e);
  } finally {
    m_ib_prefs.setBoolPref("dom.quotaManager.testing", orig_quota_test);
  }

  i2pbutton_log(3, "New Identity: Clearing Cookies and DOM Storage");

  if (m_ib_prefs.getBoolPref('extensions.i2pbutton.cookie_protections', true)) {
    var selector = Components.classes["@geti2p.net/cookie-jar-selector;1"]
                    .getService(Components.interfaces.nsISupports)
                    .wrappedJSObject;
    // This emits "cookie-changed", "cleared", which kills DOM storage
    // and the safe browsing API key
    selector.clearUnprotectedCookies("i2p");
  } else {
    i2pbutton_clear_cookies();
  }

  i2pbutton_log(3, "New Identity: Closing open connections");

  // Clear keep-alive
  obsSvc.notifyObservers(this, "net:prune-all-connections", null);

  i2pbutton_log(3, "New Identity: Clearing Content Preferences");

  // XXX: This may not clear zoom site-specific
  // browser.content.full-zoom
  if (Ci.nsIContentPrefService2) {   // Firefox >= 20
    XPCOMUtils.defineLazyModuleGetter(this, "PrivateBrowsingUtils",
                            "resource://gre/modules/PrivateBrowsingUtils.jsm");
    var pbCtxt = PrivateBrowsingUtils.privacyContextFromWindow(window);
    var cps = Cc["@mozilla.org/content-pref/service;1"].getService(Ci.nsIContentPrefService2);
    cps.removeAllDomains(pbCtxt);
  } else {                           // Firefox < 20
    var cps = Cc["@mozilla.org/content-pref/service;1"].
        createInstance(Ci.nsIContentPrefService);
    cps.removeGroupedPrefs();
  }

  i2pbutton_log(3, "New Identity: Syncing prefs");

  // Force prefs to be synced to disk
  Services.prefs.savePrefFile(null);

  i2pbutton_log(3, "New Identity: Clearing permissions");

  let pm = Cc["@mozilla.org/permissionmanager;1"].getService(Ci.nsIPermissionManager);
  pm.removeAll();

  i2pbutton_log(3, "Ending any remaining private browsing sessions.");
  obsSvc.notifyObservers(null, "last-pb-context-exited", "");

  i2pbutton_log(3, "New Identity: Opening a new browser window");

  // Open a new window with the TBB check homepage
  // In Firefox >=19, can pass {private: true} but we do not need it because
  // we have browser.privatebrowsing.autostart = true
  OpenBrowserWindow();

  i2pbutton_log(3, "New identity successful");

  // Run garbage collection and cycle collection after window is gone.
  // This ensures that blob URIs are forgotten.
  window.addEventListener("unload", function (event) {
    i2pbutton_log(3, "Initiating New Identity GC pass");
    // Clear out potential pending sInterSliceGCTimer:
    m_ib_domWindowUtils.runNextCollectorTimer();

    // Clear out potential pending sICCTimer:
    m_ib_domWindowUtils.runNextCollectorTimer();

    // Schedule a garbage collection in 4000-1000ms...
    m_ib_domWindowUtils.garbageCollect();

    // To ensure the GC runs immediately instead of 4-10s from now, we need
    // to poke it at least 11 times.
    // We need 5 pokes for GC, 1 poke for the interSliceGC, and 5 pokes for CC.
    // See nsJSContext::RunNextCollectorTimer() in
    // https://mxr.mozilla.org/mozilla-central/source/dom/base/nsJSEnvironment.cpp#1970.
    // XXX: We might want to make our own method for immediate full GC...
    for (let poke = 0; poke < 11; poke++) {
       m_ib_domWindowUtils.runNextCollectorTimer();
    }

    // And now, since the GC probably actually ran *after* the CC last time,
    // run the whole thing again.
    m_ib_domWindowUtils.garbageCollect();
    for (let poke = 0; poke < 11; poke++) {
       m_ib_domWindowUtils.runNextCollectorTimer();
    }

    i2pbutton_log(3, "Completed New Identity GC pass");
  });

  // Close the current window for added safety
  window.close();
}

function i2pbutton_clear_image_caches()
{
  try {
    let imgCache;
    let imgTools = Cc["@mozilla.org/image/tools;1"].getService(Ci.imgITools);
    if (!("getImgCacheForDocument" in imgTools)) {
      // In Firefox 17 and older, there is one global image cache.  Clear it.
      imgCache = Cc["@mozilla.org/image/cache;1"].getService(Ci.imgICache);
      imgCache.clearCache(false); // evict all but chrome cache
    } else {
      // In Firefox 18 and newer, there are two image caches:  one that is
      // used for regular browsing and one that is used for private browsing.

      // Clear the non-private browsing image cache.
      imgCache = imgTools.getImgCacheForDocument(null);
      imgCache.clearCache(false); // evict all but chrome cache

      // Try to clear the private browsing cache.  To do so, we must locate
      // a content document that is contained within a private browsing window.
      let didClearPBCache = false;
      let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
      let enumerator = wm.getEnumerator("navigator:browser");
      while (!didClearPBCache && enumerator.hasMoreElements()) {
        let win = enumerator.getNext();
        let browserDoc = win.document.documentElement;
        if (!browserDoc.hasAttribute("privatebrowsingmode"))
          continue;

        let tabbrowser = win.getBrowser();
        if (!tabbrowser)
          continue;

        var tabCount = tabbrowser.browsers.length;
        for (var i = 0; i < tabCount; i++) {
          let doc = tabbrowser.browsers[i].contentDocument;
          if (doc) {
            imgCache = imgTools.getImgCacheForDocument(doc);
            imgCache.clearCache(false); // evict all but chrome cache
            didClearPBCache = true;
            break;
          }
        }
      }
    }
  } catch(e) {
    // FIXME: This can happen in some rare cases involving XULish image data
    // in combination with our image cache isolation patch. Sure isn't
    // a good thing, but it's not really a super-cookie vector either.
    // We should fix it eventually.
    i2pbutton_log(4, "Exception on image cache clearing: "+e);
  }
}

function i2pbutton_toggle_plugins(disable_plugins) {
  if (m_ib_ibb) {
    var PH=Cc["@mozilla.org/plugin/host;1"].getService(Ci.nsIPluginHost);
    var P=PH.getPluginTags({});
    for(var i=0; i<P.length; i++) {
        if ("enabledState" in P[i]) { // FF24
          // FIXME: DOCDOC the reasoning for the isDisabled check, or remove it.
          var isDisabled = (P[i].enabledState == Ci.nsIPluginTag.STATE_DISABLED);
          if (!isDisabled && disable_plugins)
            P[i].enabledState = Ci.nsIPluginTag.STATE_DISABLED;
          else if (isDisabled && !disable_plugins)
            P[i].enabledState = Ci.nsIPluginTag.STATE_CLICKTOPLAY;
        } else if (P[i].disabled != disable_plugins) { // FF17
          P[i].disabled=disable_plugins;
        }
    }
  }
}

function i2pbutton_update_disk_prefs() {
    var mode = m_ib_prefs.getBoolPref("browser.privatebrowsing.autostart");

    m_ib_prefs.setBoolPref("browser.cache.disk.enable", !mode);
    m_ib_prefs.setBoolPref("places.history.enabled", !mode);

    m_ib_prefs.setBoolPref("security.nocertdb", mode);

    // No way to clear this beast during New Identity. Leave it off.
    //m_ib_prefs.setBoolPref("dom.indexedDB.enabled", !mode);

    if (m_ib_ibb) m_ib_prefs.setBoolPref("permissions.memory_only", mode);

    // Third party abuse. Leave it off for now.
    //m_ib_prefs.setBoolPref("browser.cache.offline.enable", !mode);

    if (mode) {
        m_ib_prefs.setIntPref("network.cookie.lifetimePolicy", 2);
        m_ib_prefs.setIntPref("browser.download.manager.retention", 1);
    } else {
        m_ib_prefs.setIntPref("network.cookie.lifetimePolicy", 0);
        m_ib_prefs.setIntPref("browser.download.manager.retention", 2);
    }

    // Force prefs to be synced to disk
    Services.prefs.savePrefFile(null);
}

function i2pbutton_update_fingerprinting_prefs() {
    var mode = m_ib_prefs.getBoolPref("privacy.resistFingerprinting");

    m_ib_prefs.setBoolPref("webgl.disable-extensions", mode);
    m_ib_prefs.setBoolPref("dom.network.enabled", !mode);
    m_ib_prefs.setBoolPref("dom.enable_performance", !mode);
    m_ib_prefs.setBoolPref("plugin.expose_full_path", !mode);
    m_ib_prefs.setBoolPref("browser.zoom.siteSpecific", !mode);

    m_ib_prefs.setBoolPref("extensions.i2pbutton.resize_new_windows", mode);

    // Force prefs to be synced to disk
    Services.prefs.savePrefFile(null);
}

function i2pbutton_do_startup()
{
  if(m_ib_prefs.getBoolPref("extensions.i2pbutton.startup")) {
    // Bug 1506: Still want to do this
    i2pbutton_toggle_plugins(
            m_ib_prefs.getBoolPref("plugin.disable"));

    // Bug 1506: Should probably be moved to an XPCOM component
    i2pbutton_do_main_window_startup();

    // For charsets
    i2pbutton_update_fingerprinting_prefs();

    // Bug 30565: sync browser.privatebrowsing.autostart with security.nocertdb
    i2pbutton_update_disk_prefs();

    // #5758: Last ditch effort to keep Vanilla i2pbutton users from totally
    // being pwnt.  This is a pretty darn ugly hack, too. But because of #5863,
    // we really don't care about preserving the user's values for this.
    if (!m_ib_ibb) {
        // Bug 1506 P5: You have to set these two for non-TBB Firefoxen
        m_ib_prefs.setBoolPref("network.websocket.enabled", false);
        m_ib_prefs.setBoolPref("dom.indexedDB.enabled", false);
    }

    // Still need this in case people shove this thing back into FF
    if (!m_ib_ibb && m_ib_prefs.getBoolPref("extensions.i2pbutton.prompt_i2pbrowser")) {
      var warning = i2pbutton_get_property_string("i2pbutton.popup.short_i2pbrowser");
      var title = i2pbutton_get_property_string("i2pbutton.title.prompt_i2pbrowser");
      var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
      prompts.alert(null, title, warning);
    }

    // For general pref fixups to handle pref damage in older versions
    i2pbutton_fixup_old_prefs();

    m_ib_prefs.setBoolPref("extensions.i2pbutton.startup", false);
  }
}

// Bug 1506 P3: This is needed pretty much only for the version check
// and the window resizing. See comments for individual functions for
// details
function i2pbutton_new_window(event)
{
  i2pbutton_log(3, "New window");
  var browser = window.gBrowser;

  if(!browser) {
    i2pbutton_log(5, "No browser for new window.");
    return;
  }

  m_tb_window_height = window.outerHeight;
  m_tb_window_width = window.outerWidth;

  if (!m_tb_wasinited) {
      i2pbutton_init();
  }
  // Add tab open listener..
  browser.tabContainer.addEventListener("TabOpen", i2pbutton_new_tab, false);

  i2pbutton_do_startup();

  let progress = Cc["@mozilla.org/docloaderservice;1"]
                    .getService(Ci.nsIWebProgress);

  if (m_ib_prefs.getBoolPref("extensions.i2pbutton.resize_new_windows")
          && i2pbutton_is_windowed(window)) {
    progress.addProgressListener(i2pbutton_resizelistener,
                                  Ci.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
  }

  // Check the version on every new window. We're already pinging check in these cases.
  //i2pbutton_do_async_versioncheck();

}

// Bug 1506 P1/P3: Setting a fixed window size is important, but
// probably not for android.
var i2pbutton_resizelistener =
{
  QueryInterface: function(aIID)
  {
   if (aIID.equals(Ci.nsIWebProgressListener) ||
       aIID.equals(Ci.nsISupportsWeakReference) ||
       aIID.equals(Ci.nsISupports))
     return this;
   throw Cr.NS_NOINTERFACE;
  },

  onLocationChange: function(aProgress, aRequest, aURI) {},
  onStateChange: function(aProgress, aRequest, aFlag, aStatus) {
    if (aFlag & Ci.nsIWebProgressListener.STATE_STOP) {
      m_ib_resize_handler = async function() {
        // Wait for end of execution queue to ensure we have correct windowState.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (window.windowState === window.STATE_MAXIMIZED ||
            window.windowState === window.STATE_FULLSCREEN) {
          if (m_tb_prefs.
              getIntPref("extensions.i2pbutton.maximize_warnings_remaining") > 0) {

            // Do not add another notification if one is already showing.
            const kNotificationName = "i2pbutton-maximize-notification";
            let box = gBrowser.getNotificationBox();
            if (box.getNotificationWithValue(kNotificationName))
              return;

            // Rate-limit showing our notification if needed.
            if (m_ib_resize_date === null) {
              m_ib_resize_date = Date.now();
            } else {
              // We wait at least another second before we show a new
              // notification. Should be enough to rule out OSes that call our
              // handler rapidly due to internal workings.
              if (Date.now() - m_ib_resize_date < 1000) {
                return;
              }
              // Resizing but we need to reset |m_tb_resize_date| now.
              m_ib_resize_date = Date.now();
            }

            let sb = i2pbutton_get_stringbundle();
            // No need to get "OK" translated again.
            let sbSvc = Cc["@mozilla.org/intl/stringbundle;1"].
              getService(Ci.nsIStringBundleService);
            let bundle = sbSvc.
              createBundle("chrome://global/locale/commonDialogs.properties");
            let button_label = bundle.GetStringFromName("OK");

            let buttons = [{
              label: button_label,
              accessKey: 'O',
              popup: null,
              callback:
                function() {
                  m_ib_prefs.setIntPref("extensions.i2pbutton.maximize_warnings_remaining",
                  m_ib_prefs.getIntPref("extensions.i2pbutton.maximize_warnings_remaining") - 1);
                }
            }];

            let priority = box.PRIORITY_WARNING_LOW;
            let message =
              i2pbutton_get_property_string("i2pbutton.maximize_warning");

            box.appendNotification(message, kNotificationName, null,
                                   priority, buttons);
            return;
          }
        }
      }; // m_ib_resize_handler

      // We need to handle OSes that auto-maximize windows depending on user
      // settings and/or screen resolution in the start-up phase and users that
      // try to shoot themselves in the foot by maximizing the window manually.
      // We add a listener which is triggerred as soon as the window gets
      // maximized (windowState = 1). We are resizing during start-up but not
      // later as the user should see only a warning there as a stopgap before
      // #14229 lands.
      // Alas, the Firefox window code is handling the event not itself:
      // "// Note the current implementation of SetSizeMode just stores
      //  // the new state; it doesn't actually resize. So here we store
      //  // the state and pass the event on to the OS."
      // (See: https://mxr.mozilla.org/mozilla-esr31/source/xpfe/appshell/src/
      // nsWebShellWindow.cpp#348)
      // This means we have to cope with race conditions and resizing in the
      // sizemodechange listener is likely to fail. Thus, we add a specific
      // resize listener that is doing the work for us. It seems (at least on
      // Ubuntu) to be the case that maximizing (and then again normalizing) of
      // the window triggers more than one resize event the first being not the
      // one we need. Thus we can't remove the listener after the first resize
      // event got fired. Thus, we have the rather klunky setTimeout() call.
      window.addEventListener("sizemodechange", m_ib_resize_handler, false);

      let progress = Cc["@mozilla.org/docloaderservice;1"]
                       .getService(Ci.nsIWebProgress);
      progress.removeProgressListener(this);
    }
  }, // onStateChange

  onProgressChange: function(aProgress, aRequest, curSelfProgress,
                             maxSelfProgress, curTotalProgress,
                             maxTotalProgress) {},
  onStatusChange: function(aProgress, aRequest, stat, message) {},
  onSecurityChange: function() {}
};

// Bug 1506 P2: This is only needed because we have observers
// in XUL that should be in an XPCOM component
function i2pbutton_close_window(event) {
    i2pbutton_window_pref_observer.unregister();
    i2pbutton_tor_check_observer.unregister();

    window.removeEventListener("sizemodechange", m_ib_resize_handler,
        false);

    // TODO: This is a real ghetto hack.. When the original window
    // closes, we need to find another window to handle observing
    // unique events... The right way to do this is to move the
    // majority of i2pbutton functionality into a XPCOM component..
    // But that is a major overhaul..
    if (m_tb_is_main_window) {
        i2pbutton_log(3, "Original window closed. Searching for another");
        var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
            .getService(Components.interfaces.nsIWindowMediator);
        var enumerator = wm.getEnumerator("navigator:browser");
        while(enumerator.hasMoreElements()) {
            var win = enumerator.getNext();
            // For some reason, when New Identity is called from a pref
            // observer (ex: i2pbutton_use_nontor_proxy) on an ASAN build,
            // we sometimes don't have this symbol set in the new window yet.
            // However, the new window will run this init later in that case,
            // as it does in the OSX case.
            if(win != window && "i2pbutton_do_main_window_startup" in win) {
                i2pbutton_log(3, "Found another window");
                win.i2pbutton_do_main_window_startup();
                m_tb_is_main_window = false;
                break;
            }
        }

        i2pbutton_unique_pref_observer.unregister();

        if(m_tb_is_main_window) { // main window not reset above
            // This happens on Mac OS because they allow firefox
            // to still persist without a navigator window
            i2pbutton_log(3, "Last window closed. None remain.");
            m_ib_prefs.setBoolPref("extensions.i2pbutton.startup", true);
            m_tb_is_main_window = false;
        }
    }
}

function showSecurityPreferencesPanel(chromeWindow) {
  const tabBrowser = chromeWindow.BrowserApp;
  let settingsTab = null;

  const SECURITY_PREFERENCES_URI = 'chrome://i2pbutton/content/preferences.xhtml';

  tabBrowser.tabs.some(function (tab) {
      // If the security prefs tab is opened, send the user to it
      if (tab.browser.currentURI.spec === SECURITY_PREFERENCES_URI) {
          settingsTab = tab;
          return true;
      }
      return false;
  });

  if (settingsTab === null) {
      // Open up the settings panel in a new tab.
      tabBrowser.addTab(SECURITY_PREFERENCES_URI, {
          'selected': true,
          'parentId': tabBrowser.selectedTab.id
      });
  } else {
      // Activate an existing settings panel tab.
      tabBrowser.selectTab(settingsTab);
  }
}

function i2pbutton_do_main_window_startup()
{
  i2pbutton_log(3, "I2pbutton main window startup");
  m_ib_is_main_window = true;
  i2pbutton_unique_pref_observer.register();
}

// Bug 1506 P4: Most of this function is now useless, save
// for the very important SOCKS environment vars at the end.
// Those could probably be rolled into a function with the
// control port vars, though. See 1506 comments inside.
function i2pbutton_do_startup()
{
  if(m_ib_prefs.getBoolPref("extensions.i2pbutton.startup")) {
    // Bug 1506: Still want to do this
    i2pbutton_toggle_plugins(
            m_ib_prefs.getBoolPref("plugin.disable"));

    // Bug 1506: Should probably be moved to an XPCOM component
    i2pbutton_do_main_window_startup();

    // For charsets
    i2pbutton_update_fingerprinting_prefs();

    // Bug 30565: sync browser.privatebrowsing.autostart with security.nocertdb
    i2pbutton_update_disk_prefs();

    // #5758: Last ditch effort to keep Vanilla Torbutton users from totally
    // being pwnt.  This is a pretty darn ugly hack, too. But because of #5863,
    // we really don't care about preserving the user's values for this.
    if (!m_ib_ibb) {
      // Bug 1506 P5: You have to set these two for non-TBB Firefoxen
      m_ib_prefs.setBoolPref("network.websocket.enabled", false);
      m_ib_prefs.setBoolPref("dom.indexedDB.enabled", false);
    }

    // Still need this in case people shove this thing back into FF
    if (!m_ib_ibb && m_ib_prefs.getBoolPref("extensions.i2pbutton.prompt_i2pbrowser")) {
      var warning = i2pbutton_get_property_string("i2pbutton.popup.short_i2pbrowser");
      var title = i2pbutton_get_property_string("i2pbutton.title.prompt_i2pbrowser");
      var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
      prompts.alert(null, title, warning);
    }

    m_ib_prefs.setBoolPref("extensions.i2pbutton.startup", false);
  }
}

// Perform version check when a new tab is opened.
function i2pbutton_new_tab(event)
{
    // listening for new tabs
    i2pbutton_log(3, "New tab");

    /* Perform the version check on new tab, module timer */
    //i2pbutton_do_async_versioncheck();
}

// Returns true if the window wind is neither maximized, full screen,
// ratpoisioned/evilwmed, nor minimized.
function i2pbutton_is_windowed(wind) {
  i2pbutton_log(3, "Window: (" + wind.outerWidth + "," + wind.outerHeight + ") ?= ("
                   + wind.screen.availWidth + "," + wind.screen.availHeight + ")");
  if(wind.windowState == Components.interfaces.nsIDOMChromeWindow.STATE_MINIMIZED
    || wind.windowState == Components.interfaces.nsIDOMChromeWindow.STATE_MAXIMIZED) {
      i2pbutton_log(2, "Window is minimized/maximized");
      return false;
  }
  if ("fullScreen" in wind && wind.fullScreen) {
    i2pbutton_log(2, "Window is fullScreen");
    return false;
  }
  if(wind.outerHeight == wind.screen.availHeight
      && wind.outerWidth == wind.screen.availWidth) {
    i2pbutton_log(3, "Window is ratpoisoned/evilwm'ed");
    return false;
  }

  i2pbutton_log(2, "Window is normal");
  return true;
}

// Bug 1506 P3: This is needed pretty much only for the version check
// and the window resizing. See comments for individual functions for
// details
function i2pbutton_new_window(event)
{
    i2pbutton_log(3, "New window");
    var browser = window.gBrowser;

    if(!browser) {
      i2pbutton_log(5, "No browser for new window.");
      return;
    }

    m_ib_window_height = window.outerHeight;
    m_ib_window_width = window.outerWidth;

    if (!m_ib_is_initialized) {
        i2pbutton_init();
    }
    // Add tab open listener..
    browser.tabContainer.addEventListener("TabOpen", i2pbutton_new_tab, false);

    i2pbutton_do_startup();

    let progress = Cc["@mozilla.org/docloaderservice;1"]
                     .getService(Ci.nsIWebProgress);

    if (m_ib_prefs.getBoolPref("extensions.i2pbutton.resize_new_windows")
            && i2pbutton_is_windowed(window)) {
      progress.addProgressListener(i2pbutton_resizelistener,
                                   Ci.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
    }

    // Check the version on every new window. We're already pinging check in these cases.
    //i2pbutton_do_async_versioncheck();

    //i2pbutton_do_i2p_check();
}

// Bug 1506 P2: This is only needed because we have observers
// in XUL that should be in an XPCOM component
function i2pbutton_close_window(event) {
    i2pbutton_window_pref_observer.unregister();
    i2pbutton_i2p_check_observer.unregister();

    window.removeEventListener("sizemodechange", m_ib_resize_handler,
        false);

    // TODO: This is a real ghetto hack.. When the original window
    // closes, we need to find another window to handle observing
    // unique events... The right way to do this is to move the
    // majority of i2pbutton functionality into a XPCOM component..
    // But that is a major overhaul..
    if (m_ib_is_main_window) {
        i2pbutton_log(3, "Original window closed. Searching for another");
        var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
            .getService(Components.interfaces.nsIWindowMediator);
        var enumerator = wm.getEnumerator("navigator:browser");
        while(enumerator.hasMoreElements()) {
          var win = enumerator.getNext();
          // For some reason, when New Identity is called from a pref
          // observer (ex: i2pbutton_use_nontor_proxy) on an ASAN build,
          // we sometimes don't have this symbol set in the new window yet.
          // However, the new window will run this init later in that case,
          // as it does in the OSX case.
          if(win != window && "i2pbutton_do_main_window_startup" in win) {
            i2pbutton_log(3, "Found another window");
            win.i2pbutton_do_main_window_startup();
            m_ib_is_main_window = false;
            break;
          }
        }

        i2pbutton_unique_pref_observer.unregister();

        if(m_ib_is_main_window) { // main window not reset above
          // This happens on Mac OS because they allow firefox
          // to still persist without a navigator window
          i2pbutton_log(3, "Last window closed. None remain.");
          m_ib_prefs.setBoolPref("extensions.i2pbutton.startup", true);
          m_ib_is_main_window = false;
        }
    }
}

window.addEventListener('load', i2pbutton_new_window, false);
window.addEventListener('unload', i2pbutton_close_window, false);


// -------------- JS/PLUGIN HANDLING CODE ---------------------
// Bug 1506 P3: Defense in depth. Disables JS and events for New Identity.
function i2pbutton_disable_browser_js(browser) {
  var eventSuppressor = null;

  /* Solution from: https://bugzilla.mozilla.org/show_bug.cgi?id=409737 */
  // XXX: This kills the entire window. We need to redirect
  // focus and inform the user via a lightbox.
  try {
    if (!browser.contentWindow)
      i2pbutton_log(3, "No content window to disable JS events.");
    else
      eventSuppressor = browser.contentWindow.
        QueryInterface(Components.interfaces.nsIInterfaceRequestor).
          getInterface(Ci.nsIDOMWindowUtils);
  } catch(e) {
    i2pbutton_log(4, "Failed to disable JS events: "+e)
  }

  if (browser.docShell)
    browser.docShell.allowJavascript = false;

  try {
    // My estimation is that this does not get the inner iframe windows,
    // but that does not matter, because iframes should be destroyed
    // on the next load.
    browser.contentWindow.name = null;
    browser.contentWindow.window.name = null;
  } catch(e) {
    i2pbutton_log(4, "Failed to reset window.name: "+e)
  }

  if (eventSuppressor)
    eventSuppressor.suppressEventHandling(true);
}

// Bug 1506 P3: The JS-killing bits of this are used by
// New Identity as a defense-in-depth measure.
function i2pbutton_disable_window_js(win) {
  var browser = win.getBrowser();
  if(!browser) {
    i2pbutton_log(5, "No browser for plugin window...");
    return;
  }
  var browsers = browser.browsers;
  i2pbutton_log(1, "Toggle window plugins");

  for (var i = 0; i < browsers.length; ++i) {
    var b = browser.browsers[i];
    if (b && !b.docShell) {
        try {
          if (b.currentURI)
            i2pbutton_log(5, "DocShell is null for: "+b.currentURI.spec);
          else
            i2pbutton_log(5, "DocShell is null for unknown URL");
        } catch(e) {
          i2pbutton_log(5, "DocShell is null for unparsable URL: "+e);
        }
    }
    if (b && b.docShell) {
      i2pbutton_disable_browser_js(b);

      // kill meta-refresh and existing page loading
      // XXX: Despite having JUST checked b.docShell, it can
      // actually end up NULL here in some cases?
      try {
        if (b.docShell && b.webNavigation)
          b.webNavigation.stop(b.webNavigation.STOP_ALL);
      } catch(e) {
        i2pbutton_log(4, "DocShell error: "+e);
      }
    }
  }
}

// Bug 1506 P3: The JS-killing bits of this are used by
// New Identity as a defense-in-depth measure.
//
// This is an ugly beast.. But unfortunately it has to be so..
// Looping over all tabs twice is not somethign we wanna do..
function i2pbutton_disable_all_js() {
  var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                     .getService(Components.interfaces.nsIWindowMediator);
  var enumerator = wm.getEnumerator("navigator:browser");
  while(enumerator.hasMoreElements()) {
      var win = enumerator.getNext();
      i2pbutton_disable_window_js(win);
  }
}



function i2pbutton_init() {
  //SecurityPrefs.initialize()

  checkI2P(function (res) {
    i2pbutton_log(3, `Check: ${res}`)
  },function (res) {
    i2pbutton_log(3, `Check: ${res}`)
  })

  if (m_ib_is_initialized) {
    return
  }
  m_ib_is_initialized = true

  // Determine if we are running inside I2P Browser.
  var cur_version;
  try {
    cur_version = m_ib_prefs.getCharPref("i2pbrowser.version")
    m_ib_ibb = true
    i2pbutton_log(3, "This is a I2P Browser")
  } catch(e) {
    i2pbutton_log(3, "This is not a I2P Browser: "+e)
  }

  // If the I2P Browser version has changed since the last time I2pbutton
  // was loaded, reset the version check preferences in order to avoid
  // incorrectly reporting that the browser needs to be updated.
  var last_version
  try {
    last_version = m_ib_prefs.getCharPref(k_ib_last_browser_version_pref)
  } catch (e) {}
  if (cur_version != last_version) {
    m_ib_prefs.setBoolPref(k_ib_browser_update_needed_pref, false)
    if (m_ib_prefs.prefHasUserValue(k_ib_last_update_check_pref)) {
      m_ib_prefs.clearUserPref(k_ib_last_update_check_pref)
    }

    if (cur_version) {
      m_ib_prefs.setCharPref(k_ib_last_browser_version_pref, cur_version)
    }
  }

  var environ = Components.classes["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment)

  // Add about:i2p IPC message listener.
  window.messageManager.addMessageListener("AboutI2p:Loaded", i2pbutton_abouti2p_message_handler)

  // Arrange for our about:i2p content script to be loaded in each frame.
  window.messageManager.loadFrameScript("chrome://i2pbutton/content/aboutI2p/aboutI2p-content.js", true)

  i2pbutton_log(3, 'init completed')
}

