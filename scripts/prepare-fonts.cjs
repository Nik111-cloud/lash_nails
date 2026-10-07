// Fetch licensed font sources. Run scripts/subset-fonts.py afterwards.
const fs = require('node:fs');
const path = require('node:path');
(async()=>{
  const root=path.join(__dirname,'..');
  fs.mkdirSync(path.join(root,'fonts'),{recursive:true});
  fs.mkdirSync(path.join(root,'.performance'),{recursive:true});
  for(const [name,family] of [['GolosText','golostext'],['PlayfairDisplay','playfairdisplay']]) {
    const base=`https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/`;
    const font=await fetch(`${base}${name}%5Bwght%5D.ttf`);
    const license=await fetch(`${base}OFL.txt`);
    if(!font.ok || !license.ok)throw Error(`Could not download ${family}`);
    fs.writeFileSync(path.join(root,'.performance',`${name}.ttf`),Buffer.from(await font.arrayBuffer()));
    fs.writeFileSync(path.join(root,'fonts',`${family}-OFL.txt`),await license.text());
  }
})().catch(error=>{console.error(error);process.exit(1)});
