@echo off
setlocal
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
set "NPM_CLI=%ProgramFiles%\nodejs\node_modules\npm\bin\npm-cli.js"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
"%NODE_EXE%" "%NPM_CLI%" %*
exit /b %ERRORLEVEL%
