const fs = require('fs');
const path = require('path');

Editor.Panel.extend({
  style: `
    :host { margin: 5px; }
  `,

  template: fs.readFileSync(Editor.url('packages://wx-subpackage-helper/panel/index.html', 'utf8')),

  ready() {
    new window.Vue({
      el: this.shadowRoot,
      data: {
        packages: undefined,
        fileMap: new Map(),
        packageMap: new Map(),
      },
      created: function () {

      },
      methods: {
        onConfirm(event) {
          event.stopPropagation();
          this.packages = [];

          const subpackages = [];
          walkFiles(path.join(Editor.Project.path, '/assets'), '.meta', (filePath) => {
            const fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });
            if (fileContent.indexOf(`"isSubpackage": true`) > -1) {
              subpackages.push({ name: fileContent.match(/(?<="subpackageName": ")[\w-]+(?=")/)[0], path: filePath.substring(0, filePath.length - 5) });
            }
          });

          this.fileMap.clear();
          subpackages.forEach(p => {
            this.packageMap.set(p.name, { path: p.path, deps: new Map() });
            walkFiles(p.path, '.js', (filePath, fileName) => {
              this.fileMap.set(fileName, { package: p.name, path: filePath });
              const fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });
              const results = fileContent.match(/(?<=\n\w+\s+\w+\s*=\s*require\((?:'|"))[\w-]+|(?<=from[ ]+(?:'|"))[\w-]+(?=(?:'|"))/g);
              if (results) {
                results.forEach(r => {
                  if (!this.packageMap.get(p.name).deps.has(r)) {
                    this.packageMap.get(p.name).deps.set(r, new Set());
                  }
                  this.packageMap.get(p.name).deps.get(r).add(filePath)
                });
              }
            });
          });

          this.packageMap.set('main', { deps: new Map() });
          walkFiles(path.join(Editor.Project.path, '/assets'), '.js', (filePath, fileName) => {
            if (this.fileMap.has(fileName)) {
              return;
            }
            this.fileMap.set(fileName, { package: 'main', path: filePath });
            const fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });
            const results = fileContent.match(/(?<=require\((?:'|"))[\w-]+|(?<=from[ ]+(?:'|"))[\w-]+(?=(?:'|"))/g);
            if (results) {
              results.forEach(r => {
                if (!this.packageMap.get('main').deps.has(r)) {
                  this.packageMap.get('main').deps.set(r, new Set());
                }
                this.packageMap.get('main').deps.get(r).add(filePath)
              });
            }
          });

          this.packageMap.forEach((info, package) => {
            const data = { name: package, deps: [] };
            info.deps.forEach((depList, fileName) => {
              const fileInfo = this.fileMap.get(fileName);
              if (fileInfo && fileInfo.package && fileInfo.package !== package && fileInfo.package !== 'main') {
                data.deps.push({ module: fileName, list: [...depList] });
              }
            });
            if (data.deps.length > 0) {
              this.packages.push(data);
            }
          });
        },
        locateFile(filePath) {
          if (filePath) {
            const uuid = Editor.remote.assetdb.fspathToUuid(filePath);
            Editor.Ipc.sendToAll('assets:hint', uuid);
          }
        }
      },
    });
  },

});

function walkFiles(searchPath, suffix, operation) {
  const walkDir = (currentPath) => {
    const files = fs.readdirSync(currentPath);
    files.forEach(fileName => {
      const filePath = path.join(currentPath, fileName);
      const fileStat = fs.statSync(filePath);
      if (fileStat.isFile() && fileName.endsWith(suffix)) {
        const result = fileName.match(/[\w-]+(?=\.\w+)/);
        operation(filePath, result ? result[0] : fileName)
      } else if (fileStat.isDirectory()) {
        walkDir(filePath);
      }
    });
  };
  walkDir(searchPath);
}
