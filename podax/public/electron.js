const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, screen, Menu, globalShortcut, ipcMain, dialog } = require('electron');
const remote = require ("electron").remote;
const isDev = require('electron-is-dev');
const os = require('os');
const crypto = require('crypto');
const algorithm = 'aes-256-ctr';


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


const podax_encrypt = (data, key) => {
  // Initialization vector
  let initialization_vector = crypto.randomBytes(16)
  // Create Cipher useing algorithm, key, & init_vector
  let salt = Buffer.from(key).toString('base64')
  let saltkey = crypto.scryptSync(key, salt, 32);
  let cipher = crypto.createCipheriv(algorithm, saltkey, initialization_vector)
  // Encrypt
  let encrypted_data = Buffer.concat([initialization_vector, cipher.update(data), cipher.final()])

  return encrypted_data
}







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
  var dd = String(datenow.getDate()).padStart(2, '0');
  var mm = String(datenow.getMonth() + 1).padStart(2, '0'); //January is 0!
  var yyyy = datenow.getFullYear();
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
  ipcMain.on('fileselect', (event) => {
    const selectedPaths = dialog.showOpenDialog({properties: ['openFile' ]});
    selectedPaths.then(function(selectedData) {
      console.log(selectedData)
      event.reply('fileselect:reply',selectedData)
   })
  })


  // Folder Selector
  ipcMain.on('folderselect', (event) => {
    const selectedPaths = dialog.showOpenDialog({properties: ['openDirectory' ]});
    selectedPaths.then(function(selectedData) {
      console.log(selectedData)
      event.reply('folderselect:reply',selectedData)
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

      try{
        encyrption_json = file_podax_schema(args.file_path)
        encrypted_data = podax_encrypt(JSON.stringify(encyrption_json), args.pass)
        let filesavename = `${podaxhome}${encrypted_filename_gen()}`
        fs.writeFileSync(filesavename, encrypted_data)
        event.reply('encrypt:file:reply',{"success":true,"location":filesavename})
      }
      catch{
        event.reply('encrypt:file:reply',{"success":false,"location":filesavename})
      }


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