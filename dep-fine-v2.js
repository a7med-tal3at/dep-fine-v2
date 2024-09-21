const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ level, message }) => {
      return ` [${level}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logfile.log" }),
  ],
});

class TorFetch {
  constructor() {
    this.tr = require("tor-request");
    this.tr.setTorAddress("localhost", 9050);
    this.tr.TorControlPort.password = "test";
  }

  async torNewRequest(url) {
    return new Promise((resolve, reject) => {
      this.tr.newTorSession((err) => {
        if (err) {
          logger.error(`Tor session error: ${err}`);
          return reject(err);
        }
        const options = {
          url,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          },
        };
        this.tr.request(options, (err, _, body) => {
          if (err) {
            logger.error(`Request error: ${err}`);
            return reject(err);
          }
          logger.info(`Fetched data from: ${url}`);
          resolve(JSON.parse(body));
        });
      });
    });
  }
}

class Utils {
  constructor(org_name) {
    this.org_name = org_name;
    this.tr = new TorFetch();
  }

  async request(url) {
    return await this.tr.torNewRequest(url);
  }

  githubRepoUrl(queryParams) {
    const params = new URLSearchParams(queryParams);
    return `https://api.github.com/orgs/${this.org_name}/repos?${params}`;
  }

  githubRepoFilesUrl(repo) {
    return `https://api.github.com/repos/${this.org_name}/${repo}/contents`;
  }
}

class DepFind {
  constructor(org_name) {
    this.org_name = org_name;
    this.utils = new Utils(this.org_name);
  }

  async getAllRawFilesURLs(allRepos) {
    let allRawFiles = [];
    for (let repo of allRepos) {
      const files = await this.utils.request(
        this.utils.githubRepoFilesUrl(repo)
      );
      const packageJSONFile = files.filter((i) => i.name === "package.json");
      if (packageJSONFile.length) {
        const newPackageFile = packageJSONFile[0].download_url;
        allRawFiles.push(newPackageFile);
        logger.info(`New raw file was added: ${newPackageFile}`);
      }
    }
    return allRawFiles;
  }

  async checkDepRegistry(depName) {
    const registry_url = "https://registry.npmjs.com/";
    const res = await this.utils.request(registry_url + depName);
    if (!res.name) {
      logger.warn(`Dependency Not Found: ${depName}`);
    } else {
      logger.info(`found: ${res.name}`);
    }
  }

  async getAllpackgeJSONDeps(rawURL) {
    const packgeJSON = await this.utils.request(rawURL);
    const deps = Object.keys(packgeJSON.dependencies);
    const devDeps = Object.keys(packgeJSON.devDependencies);
    return [...deps, ...devDeps];
  }

  async getAllOrgRepos() {
    let page = 1;
    const jsRepos = [];
    try {
      while (true) {
        const repos = await this.utils.request(
          this.utils.githubRepoUrl({ per_page: 100, page })
        );
        if (repos.length === 0) break;
        for (const repo of repos) {
          if (repo.language === "JavaScript") {
            jsRepos.push(repo);
          }
        }
        page++;
      }
      return jsRepos.map((i) => i.name);
    } catch (error) {
      logger.error("Error fetching repos:", error);
    }
  }

  async run() {
    const allRepos = await this.getAllOrgRepos();
    const allRawFiles = await this.getAllRawFilesURLs(allRepos);
    const allDeps = allRawFiles.map(
      async (rawFile) => await this.getAllpackgeJSONDeps(rawFile)
    );
    for (let dep of allDeps) await this.checkDepRegistry(dep);
  }
}

new DepFind("adobe").run();
