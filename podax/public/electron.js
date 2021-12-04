const path = require('path');
const { app, BrowserWindow, screen, Menu, globalShortcut, ipcMain } = require('electron');
const remote = require ("electron").remote;
const isDev = require('electron-is-dev');

function createWindow() {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 700,
    height: 700,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
  });

  // and load the index.html of the app.
  // win.loadFile("index.html");


  win.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../build/index.html')}`
  );

  // Open the DevTools.
  if (isDev) {
    console.log("Supposed to be only dev environment log")
  }
  win.webContents.openDevTools({ mode: 'detach' });


  // Remove top menu
  win.setMenu(null)


  // EVENT LISTENERS ~~~~~~~~~~
  ipcMain.on('app:minimize', function(event){
    win.minimize()
  })

  ipcMain.on('app:exit', (evt, arg) =>{
    app.quit()
  })



}















// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});