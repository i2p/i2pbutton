#!/bin/sh
APP_NAME=i2pbutton
#VERSION=`grep em:version src/install.rdf | sed -e 's/["]//g' | cut -f2 -d=`
XPI_NAME="$APP_NAME-`grep em:version src/install.rdf | sed -e 's/[<>]/	/g' | cut -f3`.xpi"

if [ -e "pkg/$XPI_NAME" ]; then
  echo pkg/$XPI_NAME already exists.
  rm pkg/$XPI_NAME # meh.
  #  exit 1
fi

# create jar file (we're just storing files here)
echo ---------- create $APP_NAME.jar file ----------
cd src/chrome
cd ../..

# create .xpi
echo ---------- create $APP_NAME.xpi ----------
# create the pkg directory if it doesn't exist yet
mkdir -p pkg
cd src
echo zip -X -9r ../pkg/$XPI_NAME ./ -x "chrome/*" -x "*.diff" -x "*.svn/*"
zip -X -9r ../pkg/$XPI_NAME ./ -x "*.svn/*" -x "*.diff" #-x "chrome/*"
cd ..

