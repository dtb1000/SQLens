# Installing SQLens

## Windows

1. Open the [Releases page](https://github.com/dtb1000/SQLens/releases) and download the newest `SQLens-Setup-<version>.exe`.
2. Double-click the file.
3. Windows may show a blue box that says "Windows protected your PC". This appears because the installer is not signed with a paid certificate. Click **More info**, then **Run anyway**.
4. SQLens installs for your Windows account only, so it does not ask for an administrator password. It adds **SQLens** to the Start menu and the desktop, and opens on the start page.

To update, download and run the newer installer. Your settings, history and lesson progress are kept.

To remove SQLens, open **Settings > Apps > Installed apps**, find SQLens and choose **Uninstall**.

## macOS and Linux

There is no installer for these yet. Run SQLens from its source code as described below.

## Run from the source code

You need Git and [Node.js](https://nodejs.org/) 20 or newer. Node 22 LTS is recommended.

```sh
git clone https://github.com/dtb1000/SQLens.git
cd SQLens
npm install
npm start
```

`npm run dist` builds an installer for the computer you run it on, into the `dist` folder. If `npm start` says "Electron failed to install correctly", the README explains the two usual causes and how to fix them.

## Make the first installer for a new copy of the repository

The Windows installer is built on GitHub, so a new copy of this repository has no download until it has been built once.

1. Push the files to the `main` branch. The **Build** workflow runs the tests and builds the installer.
2. Open **Actions > Build > Run workflow**, tick **Publish a release**, and run it.
3. When it finishes, the installer is on the Releases page under the version number from `package.json`.

## After installing

The [user guide](docs/user-guide.md) explains every part of the app, and is also inside SQLens under **Documentation**. To learn SQL from the start, click **Learn SQL step by step** on the start page, or read the [tutorials](docs/tutorials.md).
