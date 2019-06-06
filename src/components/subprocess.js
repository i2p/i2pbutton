const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Subprocess.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

let EXPORTED_SYMBOLS = [ 'IILauncherSubProcess' ]

XPCOMUtils.defineLazyModuleGetter(this, "LauncherUtil",
                          "resource://i2pbutton/modules/launcher-util.jsm")

function _SubProcess(opts)
{
  this.kCurrentSubProcessOpts = Object.assign({} ,opts, {
    //command: '/bin/ls',
    //arguments: ['/'],
    workdir: '/',
    environment: [],
    stderr: "pipe"
  })
}

let IILauncherSubProcess = {
  createSubProcess: function(opts) {
    return new _SubProcess(opts)
  }
}

Object.freeze(IILauncherSubProcess)

_SubProcess.prototype = {
  kLibVersion: '0.0.1',
  kCurrentSubProcess: null,
  kCurrentSubProcessStdOutBuffer: null,
  init: function() {
    //
  },
  close: function() {
    if (this.kCurrentSubProcess !== null)
    {
      this.kCurrentSubProcess.kill()
      this.kCurrentSubProcess = null
    }
  },
  exec: function() {
    Subprocess.call(this.kCurrentSubProcessOpts).then(aProc => {
      this.kCurrentSubProcess = aProc
      new Promise((aResolve, aReject) =>
      {
        this._readStdOut(aResolve, aReject)
      })
    })
  },
  _readStdOut: function (aProc, errReject) {
    this.kCurrentSubProcess.stdout.readString().then(out => {
      /*if (!out || (out.length == 0))
      {
        throw new Error('Error: stdout is empty')
      }*/
      if (this.kCurrentSubProcessStdOutBuffer === null) {
        this.kCurrentSubProcessStdOutBuffer = out
      } else {
        this.kCurrentSubProcessStdOutBuffer += out
      }
      this._readStdOut(aProc, errReject)
    }).catch(err => {
      errReject(err)
    })
  },
  await: function() {
    let {exitCode} = await this.kCurrentSubProcess.wait()
    this.kCurrentSubProcessExitCode = exitCode
    return exitCode
  }
}
