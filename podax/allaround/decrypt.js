const crypto = require('crypto')
let algorithm = 'aes-256-ctr';
let key = 'owner twofold evaluate zinger boss duets smidgen vacation'
let salt = Buffer.from(key).toString('base64')
let saltkey = crypto.scryptSync(key, salt, 32);
const fs = require('fs');

const decrypt = (encrypted) => {
    // Get the iv: the first 16 bytes
    const iv = encrypted.slice(0, 16);
    // Get the rest
    encrypted = encrypted.slice(16);
    // Create a decipher
    const decipher = crypto.createDecipheriv(algorithm, saltkey, iv);
    // Actually decrypt it
    const result = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return result;
 };

const buff = fs.readFileSync('12_27_2021___12_41_15.podax');
let json_string = decrypt(buff)
end_result = JSON.parse(json_string.toString())

console.log(end_result)