const pre = ['Bronze', 'Iron', 'Steel', 'Mith', 'Rune', 'Dragon', 'Void', 'Karamjan', 'Oak', 'Willow', 'Maple', 'Dark', 'Light', 'Swift', 'Shadow', 'Ghost', 'Night', 'Storm', 'Gielinor', 'Cosmic', 'Lunar', 'Solar', 'Astral', 'Broken', 'Wise', 'Dark', 'Zamorakian', 'Saradomin', 'Armadyl', 'Guthixian', 'Ancient', 'Dwarven', 'Obsidian', 'Abyssal', 'Granite', 'Mystic', 'Blessed', 'Infernal'];
const suf = ['Guy', 'Noob', 'Hero', 'Bot', 'Slayer', 'Fisher', 'Miner', 'Cook', 'Chopper', 'Mage', 'Ranger', 'Thief', 'Smith', 'Crafter', 'Tamer', 'Hunter', 'Druid', 'Knight', 'Rogue', 'Claws','Pker','Staff','Whip','Tome','Shield','Fish','Cape','Guard','Blade','Bow', 'Spear'];

function randomName() {
    const num = Math.random() < 0.4 ? Math.floor(Math.random() * 900 + 100) : '';
    return pre[Math.floor(Math.random() * pre.length)] + suf[Math.floor(Math.random() * suf.length)] + num;
}

window.randomName = randomName;


