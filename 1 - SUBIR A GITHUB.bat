@echo off
chcp 65001 >nul
title Subir a GitHub - Facturas Beval
color 0B
echo ========================================================
echo       SUBIR ACTUALIZACIONES A GITHUB PAGES
echo ========================================================
echo.
echo Abriendo tu repositorio en el navegador...
start "" "https://github.com/mmiguelan2/FACTURAS/upload/main"
explorer "%~dp0"
echo.
echo ========================================================
echo INSTRUCCIONES (En 10 segundos):
echo 1. Ya se abrio tu pagina de GitHub en el navegador.
echo 2. Arrastra los archivos de esta carpeta a la pagina web:
echo    - index.html
echo    - app.js
echo    - beval.css
echo    - styles.css
echo    - ui.js
echo    - config.js
echo    - imagenes / logos / favicon.ico
echo 3. Haz clic en el boton verde "Commit changes" abajo.
echo ========================================================
echo.
pause
