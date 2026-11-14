@echo off
setlocal
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
set "NPX_CLI=%ProgramFiles%\nodejs\node_modules\npm\bin\npx-cli.js"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
"%NODE_EXE%" "%NPX_CLI%" %*
exit /b %ERRORLEVEL%
