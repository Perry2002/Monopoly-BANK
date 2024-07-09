const fs = require("fs");
fs.writeFileSync("text.txt","Mon premier test avec node.js");
console.log("le fichier a été créé!");
 const filecontent = fs.readFileSync("text.txt","utf8");
 console.log(filecontent)