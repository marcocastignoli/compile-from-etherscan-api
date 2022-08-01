// In this file there are only functions taken from the sourcify repository

import Path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';
import { StatusCodes } from 'http-status-codes';

// eslint-disable-next-line no-new-func
const importDynamic = new Function('modulePath', 'return import(modulePath)');

const fetch = async (...args:any[]) => {
  const module = await importDynamic('node-fetch');
  return module.default(...args);
};

const log = console
const RECOMPILATION_ERR_MSG = "Recompilation error (probably caused by invalid metadata)";
const GITHUB_SOLC_REPO = "https://github.com/ethereum/solc-bin/raw/gh-pages/linux-amd64/";

export function validateSolcPath(solcPath: string, log: any): boolean {
    const spawned = spawnSync(solcPath, ["--version"]);
    if (spawned.status === 0) {
        return true;
    }

    const error = spawned.error ? spawned.error.message : "Unknown error";
    log.error({ loc: "[VALIDATE_SOLC_PATH]", solcPath, error });
    return false;
}

export async function fetchSolcFromGitHub(solcPath: string, version: string, fileName: string, log: any): Promise<boolean> {
    const githubSolcURI = GITHUB_SOLC_REPO + encodeURIComponent(fileName);
    const logObject = {loc: "[RECOMPILE]", version, githubSolcURI};
    log.info(logObject, "Fetching executable solc from GitHub");

    const res = await fetch(githubSolcURI);
    if (res.status === StatusCodes.OK) {
        log.info(logObject, "Successfully fetched executable solc from GitHub");
        fs.mkdirSync(Path.dirname(solcPath), { recursive: true });
        const buffer = await res.buffer();

        try { fs.unlinkSync(solcPath); } catch (_e) { undefined }
        fs.writeFileSync(solcPath, buffer, { mode: 0o755 });
        if (validateSolcPath(solcPath, log)) {
            return true;
        }
    } else {
        log.error(logObject, "Failed fetching executable solc from GitHub");
    }

    return false;
}

export async function getSolcExecutable(version: string, log: any): Promise<string|null> {
    const fileName = `solc-linux-amd64-v${version}`;
    const tmpSolcRepo = process.env.SOLC_REPO_TMP || Path.join("/tmp", "solc-repo");

    const repoPaths = [tmpSolcRepo, process.env.SOLC_REPO || "solc-repo"];
    for (const repoPath of repoPaths) {
        const solcPath = Path.join(repoPath, fileName);
        if (fs.existsSync(solcPath) && validateSolcPath(solcPath, log)) {
            return solcPath;
        }
    }

    const tmpSolcPath = Path.join(tmpSolcRepo, fileName);
    const success = await fetchSolcFromGitHub(tmpSolcPath, version, fileName, log);
    return success ? tmpSolcPath : null;
}

export async function useCompiler(version: string, solcJsonInput: any) {
    const inputStringified = JSON.stringify(solcJsonInput);
    const solcPath = await getSolcExecutable(version, log);
    let compiled: string|null = null;

    if (solcPath) {
        const logObject = {loc: "[RECOMPILE]", version, solcPath};
        log.info(logObject, "Compiling with external executable");

        const shellOutputBuffer = spawnSync(solcPath, ["--standard-json"], {input: inputStringified});

        // Handle errors.
        if (shellOutputBuffer.error) {
            const typedError: NodeJS.ErrnoException = shellOutputBuffer.error;
            // Handle compilation output size > stdout buffer
            if (typedError.code  === 'ENOBUFS') {
                log.error(logObject, shellOutputBuffer.error || RECOMPILATION_ERR_MSG);
                throw new Error('Compilation output size too large')
            }
            log.error(logObject, shellOutputBuffer.error || RECOMPILATION_ERR_MSG);
            throw new Error('Compilation Error')
        }
        if (!shellOutputBuffer.stdout) {
            log.error(logObject, shellOutputBuffer.error || RECOMPILATION_ERR_MSG);
            throw new Error(RECOMPILATION_ERR_MSG);
        }
        compiled = shellOutputBuffer.stdout.toString();

    } else {
        /* const soljson = await getSolcJs(version, log);
        compiled = soljson.compile(inputStringified); */
    }

    return compiled;
}