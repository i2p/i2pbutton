# I2Pbutton

I2PButton is an XUL plugin which we incorporate into the I2P Browser in order
to enable I2P-specific features and improve the user experience of the I2P
Browser. It can only be used in I2P Browser where it is specifically enabled,
but developers can build the plugin from source and side-load it to test their
changes.

## Development howto

You can build and update i2pbutton without the need of recompiling I2P browser
for most tasks.

To do this build it and copy it into your data directory. Note that these
examples assume that you only have one version of the .xpi file in the pkg/
directory where the finished product is built.

### OSX

On OSX, you will have an I2P Browser Data directory under ~/I2PBrowser-Data and
you can swap the plugin by copying it over the plugin in your working profile,
like in the following example:

```
./makexpi.sh
cp pkg/i2pbutton-*.xpi  ~/I2PBrowser-Data/Browser/914o5i1s.default/extensions/i2pbutton@geti2p.net.xpi
```

### Linux

Although the browser on Linux can be run from any location available to the
user, it was probably downloaded and extracted to your ~/Downloads/ directory.
If that is the case, then you may simply:

```
./makexpi.sh
find $HOME/Downloads/i2p-browser_en-US/ -name 'i2pbutton*.xpi' -exec cp -v {} i2pbutton.xpi.bak \;
find $HOME/Downloads/i2p-browser_en-US/ -name 'i2pbutton*.xpi' -exec cp -v pkg/i2pbutton-*.xpi {} \;
```

to automatically replace the I2PButton in your I2P browser with your working
copy. If you want to reverse this process, then:

```
find $HOME/Downloads/i2p-browser_en-US/ -name 'i2pbutton*.xpi' -exec cp -v i2pbutton.xpi.bak {} \;
```

### Windows

On Windows, your browser is usually installed to your Desktop where it's
configuration can be accessed. Your profile will be in the following directory
under, along with a default profile called "profile.default." You should usually
use the working profile directory and not the default.

To test local changes, you need to copy the pkg/i2pbutton-*.xpi over the
i2pbutton@geti2p.net.xpi

```
Desktop\I2P Browser Alpha\Browser\I2PBrowser\Data\Browser\%profile_directory%\extensions\
```