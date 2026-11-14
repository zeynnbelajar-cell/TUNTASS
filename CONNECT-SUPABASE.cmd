@echo off
setlocal
cd /d "%~dp0"
echo Connect this local workspace to the existing hosted TUNTAS Supabase project.
echo You will be asked to enter your Supabase personal access token and database password.
echo Do NOT paste either credential into ChatGPT or save it in a project file.
echo.
tools\supabase\supabase.exe login
if errorlevel 1 goto failed
tools\supabase\supabase.exe link --project-ref ssvhrnqtibmsiqlxrwss
if errorlevel 1 goto failed
echo.
echo Supabase CLI is now authenticated and the local workspace is linked.
echo Next: review the remote migrations before using db pull or deploying functions.
pause
exit /b 0
:failed
echo.
echo Connection was not completed. No production schema or function was changed.
pause
exit /b 1
