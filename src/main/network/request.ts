import * as http from 'http';
import * as https from 'https';
import { parse } from 'url';
import { ResponseDetails } from '~/common/rpc/network';

export const requestURL = (url: string): Promise<ResponseDetails> =>
  new Promise((resolve, reject) => {
    const options = parse(url);

    let { request } = http;

    if (options.protocol === 'https:') {
      request = https.request;
    }

    const req = request(options, (res) => {
      let data = '';
      res.setEncoding('binary');

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          data,
        });
      });

      res.on('error', (e) => {
        reject(e);
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.end();
  });

export const transmitJSON = <T>(url: URL, data: Object): Promise<T> =>
  new Promise((resolve, reject) => {
    let { request } = http;
    let agent = http.globalAgent;
    if (url.protocol === 'https:') {
      request = https.request;
      agent = new https.Agent({ rejectUnauthorized: false });
    }
    const content = JSON.stringify(data);
    const r = request(
      {
        host: url.hostname,
        port: url.port,
        protocol: url.protocol,
        path: '/CookiePolicyManager',
        method: 'POST',
        headers: { 'content-length': content.length },
        agent,
      },
      function (response) {
        const { statusCode } = response;
        if (statusCode >= 300) {
          reject(new Error(response.statusMessage));
        }
        const chunks: Uint8Array[] = [];
        response.on('data', (chunk) => {
          chunks.push(chunk);
        });
        response.on('end', () => {
          const result = Buffer.concat(chunks).toString();
          if (result.length > 0) {
            try {
              resolve(JSON.parse(result));
            } catch (e) {
              reject(
                `Error: transmitJSON received non-JSON content: \n${result}`,
              );
            }
          } else {
            resolve(undefined);
          }
        });
      },
    );
    r.write(content);
    r.end();
  });
