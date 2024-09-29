import { ProducerParameters, ProducerReturned } from "../../src/class";
import { Err, Ok, Result } from "ts-results";
import { release } from "../../src/p7zip";
import path from "path";
import fs from "fs";
import { log, writeGBK } from "../../src/utils";
import ini from "ini";

import shell from "shelljs";

interface RequiredObject {
  shortcutName?: string;
  launchArg?: string;
  autoClean?: boolean;
}

export default async function (
  p: ProducerParameters,
): Promise<Result<ProducerReturned, string>> {
  const { taskName, downloadedFile, workshop } = p;
  const obj = p.requiredObject as RequiredObject;

  // 解压
  const readyDir = path.join(workshop, "_ready", taskName);
  shell.mkdir("-p", readyDir);
  const s = await release(
    path.join(workshop, downloadedFile),
    `_ready/${taskName}`,
    false,
    workshop,
  );
  if (!s) {
    return new Err(`Error:Can't release ${downloadedFile}`);
  }

  // 清理
  if (obj.autoClean == undefined || obj.autoClean) {
    const deleteList = [
      "$PLUGINSDIR",
      "Other",
      "help.html",
      "App/readme.txt",
      "App/AppInfo/*.ico",
      "App/AppInfo/*.png",
    ];
    for (const f of deleteList) {
      shell.rm("-rf", path.join(readyDir, f));
    }
  }

  // 修改pac_installer_log.ini
  const iniPath = path.join(readyDir, "App/AppInfo/pac_installer_log.ini");
  if (!fs.existsSync(iniPath)) {
    log("Warning:pac_installer_log.ini not found,skipping modification");
  } else {
    const fileContent = ini.parse(fs.readFileSync(iniPath).toString())
      .PortableApps.comInstaller;
    if (!fileContent) {
      return new Err(
        `Error:Can't preprocess ${taskName}:[PortableApps.comInstaller] not found in pac_installer_log.ini`,
      );
    }
    try {
      fileContent.Info2 =
        "This file was generated by the PortableApps.com Installer wizard and modified by the official PortableApps.com Installer TM Rare Ideas, LLC as the app was installed.";
      fileContent.Run = "true";
      fileContent.InstallerVersion = fileContent.WizardVersion;
      fileContent.InstallDate = fileContent.PackagingDate;
      fileContent.InstallTime = fileContent.PackagingTime;

      const final = `[PortableApps.comInstaller]\n${ini.stringify(
        fileContent,
      )}`;
      fs.writeFileSync(iniPath, final);
    } catch (err) {
      console.log(JSON.stringify(err));
      return new Err(
        `Error:Can't preprocess ${taskName}:can't modify pac_installer_log.ini`,
      );
    }
  }

  // 扫描目录查找可执行文件
  let exe = "";
  for (const file of fs.readdirSync(readyDir)) {
    if (file.includes(".exe")) {
      exe = file;
      log(`Info:Got exe file:${file}`);
      break;
    }
  }
  if (exe == "") {
    return new Err("Error:Can't find .exe file");
  }

  // 检查是否包含"Portable"
  if (!exe.includes("Portable")) {
    log(`Warning:Exe file may be wrong:${exe}`);
  }
  // 写外置批处理
  const cmd =
    `FILE X:\\Program Files\\Edgeless\\${taskName}->X:\\Users\\PortableApps\\${taskName}` +
    `\nLINK X:\\Users\\Default\\Desktop\\${
      obj.shortcutName ?? taskName
    },X:\\Users\\PortableApps\\${taskName}\\${exe}${
      obj.launchArg ? `,${obj.launchArg}` : ""
    }`;
  writeGBK(path.join(readyDir, "..", `${taskName}.wcs`), cmd);

  return new Ok({
    readyRelativePath: "_ready",
  });
}
