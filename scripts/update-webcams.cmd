@echo off
rem Lite Foil : mise a jour quotidienne des webcams (tache planifiee Windows "LiteFoil webcams").
rem Relit les directs YouTube et corrige webcams/index.json quand un identifiant a change, puis publie.
cd /d C:\LiteFoil\litefoil-tracker || exit /b 1
git pull -q origin main >nul 2>&1
node scripts\update-webcams.mjs > "%TEMP%\litefoil-webcams.log" 2>&1
git diff --quiet -- webcams/index.json && exit /b 0
git add webcams/index.json
git -c user.name="Lite Foil webcams" -c user.email="noreply@github.com" commit -q -m "Webcams : identifiants des directs mis a jour"
git push -q origin main >> "%TEMP%\litefoil-webcams.log" 2>&1
