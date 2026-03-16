const { Client } = require("ssh2");

/**
 * Execute a command over SSH and stream stdout to a writable stream.
 * @param {object} opts
 * @param {string} opts.host
 * @param {string} opts.user
 * @param {string} opts.privateKey  - PEM string
 * @param {string} opts.command
 * @param {import('stream').Writable} opts.outStream
 * @returns {Promise<{ exitCode: number, stderr: string }>}
 */
function execOverSsh({ host, user, privateKey, command, outStream }) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stderr = "";

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        stream.on("close", (code) => {
          conn.end();
          resolve({ exitCode: code, stderr });
        });

        stream.on("data", (data) => {
          outStream.write(data);
        });

        stream.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        stream.on("error", (err) => {
          conn.end();
          reject(err);
        });
      });
    });

    conn.on("error", (err) => {
      reject(err);
    });

    conn.connect({
      host,
      port: 22,
      username: user,
      privateKey,
      readyTimeout: 20000,
    });
  });
}

/**
 * Execute a command over SSH and return stdout/stderr as strings.
 * @param {object} opts
 * @param {string} opts.host
 * @param {string} opts.user
 * @param {string} opts.privateKey
 * @param {string} opts.command
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
function execCommand({ host, user, privateKey, command }) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        stream.on("close", (code) => {
          conn.end();
          resolve({ stdout, stderr, exitCode: code });
        });

        stream.on("data", (data) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        stream.on("error", (err) => {
          conn.end();
          reject(err);
        });
      });
    });

    conn.on("error", (err) => {
      reject(err);
    });

    conn.connect({
      host,
      port: 22,
      username: user,
      privateKey,
      readyTimeout: 20000,
    });
  });
}

module.exports = { execOverSsh, execCommand };
