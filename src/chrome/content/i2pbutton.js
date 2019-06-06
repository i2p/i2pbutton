let { Services } = Cu.import("resource://gre/modules/Services.jsm", {});
const {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm")

var m_ib_prefs = Services.prefs

// This function closes all XUL browser windows except this one. For this
// window, it closes all existing tabs and creates one about:blank tab.
function i2pbutton_close_tabs_on_new_identity() {
  if (!m_ib_prefs.getBoolPref("extensions.i2pbutton.close_newnym")) {
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
  i2pbutton_log(3, "New Identity: Disabling JS");
  i2pbutton_disable_all_js();

  m_ib_prefs.setBoolPref("browser.zoom.siteSpecific",
                         !m_ib_prefs.getBoolPref("browser.zoom.siteSpecific"));
  m_ib_prefs.setBoolPref("browser.zoom.siteSpecific",
                         !m_ib_prefs.getBoolPref("browser.zoom.siteSpecific"));

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

  if(m_ib_prefs.getBoolPref('extensions.i2pbutton.clear_http_auth')) {
      var auth = Components.classes["@mozilla.org/network/http-auth-manager;1"].
          getService(Components.interfaces.nsIHttpAuthManager);
      auth.clearAll();
  }

  i2pbutton_log(3, "New Identity: Clearing Crypto Tokens");

  // Clear all crypto auth tokens. This includes calls to PK11_LogoutAll(),
  // nsNSSComponent::LogoutAuthenticatedPK11() and clearing the SSL session
  // cache.
  let sdr = Components.classes["@mozilla.org/security/sdr;1"].
                       getService(Components.interfaces.nsISecretDecoderRing);
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
   let sss = Cc["@mozilla.org/ssservice;1"].
     getService(Ci.nsISiteSecurityService);
   sss.clearAll();

  // This clears the undo tab history.
  var tabs = m_ib_prefs.getIntPref("browser.sessionstore.max_tabs_undo");
  m_ib_prefs.setIntPref("browser.sessionstore.max_tabs_undo", 0);
  m_ib_prefs.setIntPref("browser.sessionstore.max_tabs_undo", tabs);

  i2pbutton_log(3, "New Identity: Clearing Image Cache");
  i2pbutton_clear_image_caches();

  i2pbutton_log(3, "New Identity: Clearing Offline Cache");

  try {
    const LoadContextInfo = Cc["@mozilla.org/load-context-info-factory;1"]
      .getService(Ci.nsILoadContextInfoFactory);

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

  let orig_quota_test = m_ib_prefs.getBoolPref("dom.quotaManager.testing");
  try {
      // This works only by setting the pref to `true` otherwise we get an
      // exception and nothing is happening.
      m_ib_prefs.setBoolPref("dom.quotaManager.testing", true);
      Cc["@mozilla.org/dom/quota-manager-service;1"]
          .getService(Ci.nsIQuotaManagerService).clear();
  } catch(e) {
      i2pbutton_log(5, "Exception on storage clearing: "+e);
  } finally {
      m_ib_prefs.setBoolPref("dom.quotaManager.testing", orig_quota_test);
  }

  i2pbutton_log(3, "New Identity: Clearing Cookies and DOM Storage");

  if (m_ib_prefs.getBoolPref('extensions.i2pbutton.cookie_protections')) {
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
    var cps = Cc["@mozilla.org/content-pref/service;1"]
                .getService(Ci.nsIContentPrefService2);
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

  let pm = Cc["@mozilla.org/permissionmanager;1"].
           getService(Ci.nsIPermissionManager);
  pm.removeAll();

  i2pbutton_log(3, "New Identity: Sending NEWNYM");

  // We only support TBB for newnym.
  if (!m_tb_control_pass || (!m_tb_control_ipc_file && !m_tb_control_port)) {
    var warning = i2pbutton_get_property_string("i2pbutton.popup.no_newnym");
    i2pbutton_log(5, "i2pbutton cannot safely newnym. It does not have access to the I2P Control Port.");
    window.alert(warning);
  } else {
    if (!i2pbutton_send_ctrl_cmd("SIGNAL NEWNYM\r\n")) {
      var warning = i2pbutton_get_property_string("i2pbutton.popup.no_newnym");
      i2pbutton_log(5, "i2pbutton was unable to request a new tunnel from I2P");
      window.alert(warning);
    }
  }

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
    m_tb_domWindowUtils.runNextCollectorTimer();

    // Clear out potential pending sICCTimer:
    m_tb_domWindowUtils.runNextCollectorTimer();

    // Schedule a garbage collection in 4000-1000ms...
    m_tb_domWindowUtils.garbageCollect();

    // To ensure the GC runs immediately instead of 4-10s from now, we need
    // to poke it at least 11 times.
    // We need 5 pokes for GC, 1 poke for the interSliceGC, and 5 pokes for CC.
    // See nsJSContext::RunNextCollectorTimer() in
    // https://mxr.mozilla.org/mozilla-central/source/dom/base/nsJSEnvironment.cpp#1970.
    // XXX: We might want to make our own method for immediate full GC...
    for (let poke = 0; poke < 11; poke++) {
       m_tb_domWindowUtils.runNextCollectorTimer();
    }

    // And now, since the GC probably actually ran *after* the CC last time,
    // run the whole thing again.
    m_tb_domWindowUtils.garbageCollect();
    for (let poke = 0; poke < 11; poke++) {
       m_tb_domWindowUtils.runNextCollectorTimer();
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
      let wm = Cc["@mozilla.org/appshell/window-mediator;1"]
                 .getService(Ci.nsIWindowMediator);
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
  if (m_tb_tbb) {
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

    if (m_tb_tbb) m_ib_prefs.setBoolPref("permissions.memory_only", mode);

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
        if (!m_tb_tbb) {
            // Bug 1506 P5: You have to set these two for non-TBB Firefoxen
            m_ib_prefs.setBoolPref("network.websocket.enabled", false);
            m_ib_prefs.setBoolPref("dom.indexedDB.enabled", false);
        }

        // Still need this in case people shove this thing back into FF
        if (!m_tb_tbb && m_ib_prefs.getBoolPref("extensions.i2pbutton.prompt_torbrowser")) {
          var warning = i2pbutton_get_property_string("i2pbutton.popup.short_torbrowser");
          var title = i2pbutton_get_property_string("i2pbutton.title.prompt_torbrowser");
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
    i2pbutton_do_async_versioncheck();

}

// Bug 1506 P2: This is only needed because we have observers
// in XUL that should be in an XPCOM component
function i2pbutton_close_window(event) {
    i2pbutton_window_pref_observer.unregister();
    i2pbutton_tor_check_observer.unregister();

    window.removeEventListener("sizemodechange", m_tb_resize_handler,
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
