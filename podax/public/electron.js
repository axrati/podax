const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, screen, Menu, globalShortcut, ipcMain, dialog } = require('electron');
const remote = require ("electron").remote;
const isDev = require('electron-is-dev');
const os = require('os');


let homedir = os.homedir()
let podaxhome = `${homedir}${path.sep}Podax${path.sep}`


const instantiate_podax = () => {
  // Get Home directory, to make sure user can write config
  let homedir = os.homedir();
  // Check for Podax folder existence
  let podaxHomeFolder = `${homedir}${path.sep}Podax`

  if (fs.existsSync(podaxHomeFolder)) {
      console.log("Podax exists")
  }
  else{
      console.log("New Podax setup")
    // Make home directory
    fs.mkdirSync(`${homedir}${path.sep}Podax`);
}
}
instantiate_podax()




const file_podax_schema = (filepath) => {
  const buff = fs.readFileSync(filepath);
  file_name = filepath.split(path.sep).pop()
  base_data = buff.toString('base64')
  return {"obj_type":"file", "file_name":file_name, "file_data":base_data}
}


const encrypted_filename_gen = () => {
  datenow = new Date()
  time_str = datenow.toTimeString()
  time_cut = time_str.substring(0,8)
  time_cln = time_cut.replaceAll(':','_')
  var dd = String(today.getDate()).padStart(2, '0');
  var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
  var yyyy = today.getFullYear();
  return `${mm}_${dd}_${yyyy}___${time_cln}.podax`
}










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

  // Min App
  ipcMain.on('app:minimize', function(event){
    win.minimize()
  })

  // Close App
  ipcMain.on('app:exit', (evt, arg) =>{
    app.quit()
  })

  // File selector
  ipcMain.on('encrypt:fileselect', (event) => {
    const selectedPaths = dialog.showOpenDialog({properties: ['openFile' ]});
    selectedPaths.then(function(selectedData) {
      console.log(selectedData)
      event.reply('encrypt:fileselect:reply',selectedData)
   })
  })


  // Folder Selector
  ipcMain.on('encrypt:folderselect', (event) => {
    const selectedPaths = dialog.showOpenDialog({properties: ['openDirectory' ]});
    selectedPaths.then(function(selectedData) {
      console.log(selectedData)
      event.reply('encrypt:folderselect:reply',selectedData)
   })
  })

  // Filepath Validator
  ipcMain.on('file:dir:validator', (event,args) => {

    fs.lstat(args, (error, stats) => {
      if(error){
        console.log("Not a valid file or Directory")
        return_item =  {'file':false, 'dir':false}
        event.reply('file:dir:validator:reply',return_item)
      } else {
        return_item =  {'file':stats.isFile(), 'dir':stats.isDirectory()}
        event.reply('file:dir:validator:reply',return_item)
      }
    })
  })



    // Folder Selector
    ipcMain.on('encrypt:file', (event, args) => {

      encyrption_json = file_podax_schema(args.file_path)
      event.reply('encrypt:file:reply',encyrption_json)

      // fs.writeFileSync(`${podaxhome}${encrypted_filename_gen()}`,  );

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