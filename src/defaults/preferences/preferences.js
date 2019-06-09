// debug prefs
pref("extensions.i2pbutton.loglevel", 3); // Loglevel = info would be nice for the beta period.
pref("extensions.i2pbutton.logmethod",1); // 0=stdout, 1=errorconsole, 2=debuglog

pref("extensions.i2pbutton@geti2p.net.description", "chrome://i2pbutton/locale/i2pbutton.properties");
pref("extensions.i2pbutton.updateNeeded", false);

pref("app.update.url.details", "https://geti2p.net/en/download/lab")

// I2P check and proxy prefs
pref("extensions.i2pbutton.test_enabled",true);
pref("extensions.i2pbutton.test_url","http://4mucxjk5rxn2pmlgnjdbfdflhjmqqile5zxrltzl5o77mutl7jiq.b32.i2p/index.json?I2PButton=true");
pref("extensions.i2pbutton.local_i2p_check",true);

// Opt out of Firefox addon pings:
// https://developer.mozilla.org/en/Addons/Working_with_AMO
pref("extensions.i2pbutton@geti2p.net.getAddons.cache.enabled", false);

pref("extensions.i2pbutton.clear_http_auth", true);

pref("extensions.i2pbutton.prompt_i2pbrowser", true);
pref("extensions.i2pbutton.confirm_plugins", true);
pref("extensions.i2pbutton.confirm_newnym", true);

pref("extensions.i2pbutton.close_newnym", true);
// Browser home page:
pref("browser.startup.homepage", "chrome://i2pbutton/content/locale/non-localized.properties");
