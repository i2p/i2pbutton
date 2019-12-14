// debug prefs
pref("extensions.i2pbutton.loglevel", 3); // Loglevel = info would be nice for the beta period.
pref("extensions.i2pbutton.logmethod", 1); // 0=stdout, 1=errorconsole, 2=debuglog

pref("extensions.i2pbutton@geti2p.net.description", "chrome://i2pbutton/locale/i2pbutton.properties");
pref("extensions.i2pbutton.updateNeeded", false);

pref("app.update.url.details", "https://geti2p.net/en/download/lab");

// I2P check and proxy prefs
pref("extensions.i2pbutton.test_enabled",true);
pref("extensions.i2pbutton.test_url","http://4mucxjk5rxn2pmlgnjdbfdflhjmqqile5zxrltzl5o77mutl7jiq.b32.i2p/index.json?I2PButton=true");
pref("extensions.i2pbutton.local_i2p_check",true);

// Opt out of Firefox addon pings:
// https://developer.mozilla.org/en/Addons/Working_with_AMO
pref("extensions.i2pbutton@geti2p.net.getAddons.cache.enabled", false);

// I2P router control prefs:
pref("extensions.i2pbutton.start_i2p", true);
pref("extensions.i2pbutton.kill_router_on_exit", true);

// State prefs:
pref("extensions.i2pbutton.startup",false);
pref("extensions.i2pbutton.inserted_button",false);
pref("extensions.i2pbutton.inserted_security_level",false);

// Security prefs:
pref("extensions.i2pbutton.cookie_protections",true);
pref("extensions.i2pbutton.cookie_auto_protect",false);
pref("extensions.i2pbutton.clear_http_auth",true);
pref("extensions.i2pbutton.close_newnym",true);
pref("extensions.i2pbutton.resize_new_windows",true);
pref("extensions.i2pbutton.startup_state", 2); // 0=non-i2p, 1=i2p, 2=last
pref("extensions.i2pbutton.i2p_memory_jar",false);
pref("extensions.i2pbutton.noni2p_memory_jar",false);
pref("extensions.i2pbutton.launch_warning",true);

// Security Slider
pref("extensions.i2pbutton.security_slider", 4);
pref("extensions.i2pbutton.security_custom", false);

pref("extensions.i2pbutton.noscript_inited", false);
pref("extensions.i2pbutton.noscript_persist", false);

pref("extensions.i2pbutton.prompt_i2pbrowser", true);
pref("extensions.i2pbutton.confirm_plugins", true);
pref("extensions.i2pbutton.confirm_newnym", true);

pref("extensions.i2pbutton.close_newnym", true);
// Browser home page:
pref("browser.startup.homepage", "chrome://i2pbutton/content/locale/non-localized.properties");


// I2P Startup etc
pref("extensions.i2pbutton.start_i2p", true);
pref("extensions.i2pbutton.kill_router_on_exit", true);
pref("extensions.i2pbutton.console_host", "127.0.0.1");
pref("extensions.i2pbutton.console_port_i2pj", 7647);
pref("extensions.i2pbutton.console_port_i2pd", 17070);

pref("extensions.i2pbutton.pop3_port", 7645);
pref("extensions.i2pbutton.smtp_port", 7646);

// I2P Implementation
pref("extensions.i2pbutton.i2pimpl_driver", "i2pj");
