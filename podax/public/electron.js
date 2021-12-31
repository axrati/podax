const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, screen, Menu, globalShortcut, ipcMain, dialog } = require('electron');
const remote = require ("electron").remote;
const isDev = require('electron-is-dev');
const os = require('os');
const crypto = require('crypto');
const { fstat } = require('original-fs');
const algorithm = 'aes-256-ctr';


let homedir = os.homedir()
let podaxhome = `${homedir}${path.sep}Podax${path.sep}`



const folder_creator = (folderpath) => {
  if (fs.existsSync(`${folderpath}`)){
      console.log(`Folder ${folderpath} already exists!`)
      return false
  }
  else{
      console.log(`Folder ${folderpath} needs to be created!`)
      fs.mkdirSync(`${folderpath}`);
      return true
  }
}



const instantiate_podax = () => {
  // Get Home directory, to make sure user can write config
  let homedir = os.homedir();
  // Check for Podax folder existence
  let podaxHomeFolder = `${homedir}${path.sep}Podax`
  folder_creator(podaxHomeFolder)
}

instantiate_podax()




// Encrypts Buffer Data
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



const podax_decrypt = (data, key) => {
  // Get the iv: the first 16 bytes
  let iv = data.slice(0, 16);
  // Get the rest
  let encrypted = data.slice(16);
  // Key Handling
  let salt = Buffer.from(key).toString('base64')
  let saltkey = crypto.scryptSync(key, salt, 32);
  // Create a decipher
  let decipher = crypto.createDecipheriv(algorithm, saltkey, iv);

  let result = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return result;
}





const podax_write_file = (data) => {
  // {"obj_type":"file", "file_name":file_name, "file_data":base_data}
  try{
    fs.writeFile(`${podaxhome}${data.file_name}`, data.file_data, 'base64', function(err) {
      console.log(`Error is: ${err}`);
    });
    return {"success":true, "filepath":`${podaxhome}${data.file_name}`}
  }
  catch {
    console.log("Failed writefile")
    return {"success":false, "filepath":`${podaxhome}${data.file_name}`}
  }


}





const file_podax_schema = (filepath) => {
  const buff = fs.readFileSync(filepath);
  file_name = filepath.split(path.sep).pop()
  base_data = buff.toString('base64')
  return {"obj_type":"file", "file_name":file_name, "file_data":base_data}
}




const dir_podax_schema = (filename) => {
  var stats = fs.lstatSync(filename),
  info = {
      path: filename,
      file_name: path.basename(filename)
  };

if (stats.isDirectory()) {
  info.obj_type = "folder";
  info.children = fs.readdirSync(filename).map(function(child) {
      return dir_podax_schema(filename + path.sep + child);
  });
} else {
  // Assuming it's a file. In real life it could be a symlink or something else!
  let buff = fs.readFileSync(filename)
  let base_data = buff.toString('base64')
  info.file_data = base_data;
  info.obj_type = "file";

}
return info;

}










const dir_file_handler = (item, starting_folder) => {
  // Determine file home
 let filesplit_test = item.path.split(`${starting_folder}${path.sep}`)
 console.log(`processing: ${item.file_name}`)
 console.log(`Splitest: ${filesplit_test}`)
  if(item.file_name === filesplit_test[1]){
      console.log("Write to start folder")
      fs.writeFile(`${podaxhome}${starting_folder}${path.sep}${item.file_name}`, item.file_data, 'base64', function(err) {
        console.log(`Error is: ${err}`);
      });
  } else {
      console.log("Subfolder needed")
      let path_cutoff = filesplit_test[1].split(`${path.sep}${item.file_name}`) // ["a/b/c",'']
      let filehome = `${starting_folder}${path.sep}${path_cutoff[0]}`
      console.log(`shoudl be making: ${filehome}`)
      folder_creator(`${podaxhome}${filehome}`)
      fs.writeFile(`${podaxhome}${filehome}${path.sep}${item.file_name}`, item.file_data, 'base64', function(err) {
        console.log(`Error is: ${err}`);
      });
  }
}



const dir_item_looper = (row_obj, starting_folder) => {

  if(row_obj.obj_type === "file"){
      console.log("FILE HIT")
      let curr_folder_a = row_obj.path.split(`${path.sep}${row_obj.file_name}`)
      let curr_folder_b = curr_folder_a[0].split(path.sep)
      let curr_folder = curr_folder_b.pop()
      dir_file_handler(row_obj, starting_folder)
  }
  else if (row_obj.obj_type === "folder"){
      console.log("FOLDER HIT")
      row_obj.children.map( (row_2_obj) => {dir_item_looper(row_2_obj, starting_folder)})
  }

}



const unpackDirJson = (fileoutput) => {

  try{
    let inner_folder = fileoutput.file_name
    let starting_folder = `${podaxhome}${inner_folder}`
    console.log(`starting folder: ${starting_folder}`)
    folder_creator(starting_folder)
  
    for(i=0; i<fileoutput.children.length;i++){
        dir_item_looper(fileoutput.children[i], inner_folder)
    }
    console.log("done unpacking")
    return {"success":true, "filepath":`${starting_folder}`}
  }

  catch(err) {
    console.log(err.message)
    return {"success":false, "filepath":`Indeterminable`}
  }

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

  // Encrypt File selector
  ipcMain.on('fileselect', (event) => {
    const selectedPaths = dialog.showOpenDialog({properties: ['openFile' ]});
    selectedPaths.then(function(selectedData) {
      console.log(selectedData)
      event.reply('fileselect:reply',selectedData)
   })
  })


    // Decrypt File selector
    ipcMain.on('dfileselect', (event) => {
      const selectedPaths = dialog.showOpenDialog({properties: ['openFile' ]});
      selectedPaths.then(function(selectedData) {
        console.log(selectedData)
        event.reply('dfileselect:reply',selectedData)
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



    // Encrypt File
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



          // Encrypt Dir
    ipcMain.on('encrypt:dir', (event, args) => {
      try{
        encyrption_json = dir_podax_schema(args.file_path)
        encrypted_data = podax_encrypt(JSON.stringify(encyrption_json), args.pass)
        let filesavename = `${podaxhome}${encrypted_filename_gen()}`
        fs.writeFileSync(filesavename, encrypted_data)
        event.reply('encrypt:dir:reply',{"success":true,"location":filesavename})
      }
      catch(err){
        console.log(err.message)
        event.reply('encrypt:dir:reply',{"success":false,"location":"Indeterminable"})
      }

      })



    
    // Decrypt File
    ipcMain.on('decrypt:file', (event, args) => {

      try{
        let buff_data = fs.readFileSync(args.file_path);
        let decrypted_buff = podax_decrypt(buff_data, args.pass)
        let item = JSON.parse(decrypted_buff)
        if(item.obj_type === "file"){
          let return_offer = podax_write_file(JSON.parse(decrypted_buff)) // {"success":true, "filepath":`${podaxhome}${data.file_name}`}

          if(return_offer.success){
            let filesavename = return_offer.filepath
            event.reply('decrypt:file:reply',{"success":true,"location":filesavename})
          }
          else {
            let filesavename = return_offer.filepath
            event.reply('decrypt:file:reply',{"success":false,"location":filesavename})
          }
        }
        else if(item.obj_type==="folder"){
          let return_offer = unpackDirJson(JSON.parse(decrypted_buff))

          if(return_offer.success){
            let filesavename = return_offer.filepath
            event.reply('decrypt:file:reply',{"success":true,"location":filesavename})
          }
          else {
            let filesavename = return_offer.filepath
            event.reply('decrypt:file:reply',{"success":false,"location":filesavename})
          }
        }

      }

    catch(err){
      console.log(err.message)
      event.reply('decrypt:file:reply',{"success":false,"location":"Indeterminable"})
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