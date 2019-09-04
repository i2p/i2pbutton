let m_ib_i2plog = Components.classes["@geti2p.net/i2pbutton-logger;1"].getService(Components.interfaces.nsISupports).wrappedJSObject;

var m_ib_string_bundle = i2pbutton_get_stringbundle();

function i2pbutton_safelog(nLevel, sMsg, scrub) {
    m_ib_i2plog.safe_log(nLevel, sMsg, scrub);
    return true;
}

function i2pbutton_log(nLevel, sMsg) {
    m_ib_i2plog.log(nLevel, sMsg);
    return true;
}

// get a preferences branch object
// FIXME: this is lame.
function i2pbutton_get_prefbranch(branch_name) {
    var o_prefs = false;
    var o_branch = false;

    i2pbutton_log(1, "called get_prefbranch()");
    o_prefs = Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefService);
    if (!o_prefs)
    {
        i2pbutton_log(5, "Failed to get preferences-service!");
        return false;
    }

    o_branch = o_prefs.getBranch(branch_name);
    if (!o_branch)
    {
        i2pbutton_log(5, "Failed to get prefs branch!");
        return false;
    }

    return o_branch;
}

// load localization strings
function i2pbutton_get_stringbundle()
{
    var o_stringbundle = false;

    try {
        var oBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                                .getService(Components.interfaces.nsIStringBundleService);
        o_stringbundle = oBundle.createBundle("chrome://i2pbutton/locale/i2pbutton.properties");
    } catch(err) {
        o_stringbundle = false;
    }
    if (!o_stringbundle) {
        i2pbutton_log(5, 'ERROR (init): failed to find i2pbutton-bundle');
    }

    return o_stringbundle;
}

function i2pbutton_get_property_string(propertyname)
{
    try {
        if (!m_ib_string_bundle) {
            m_ib_string_bundle = i2pbutton_get_stringbundle();
        }

        return m_ib_string_bundle.GetStringFromName(propertyname);
    } catch(e) {
        i2pbutton_log(4, "Unlocalized string "+propertyname);
    }

    return propertyname;
}
