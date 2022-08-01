import {promises} from 'fs';
import keccak256 from 'keccak256';
import { useCompiler } from './utils';

function contractHasMultipleFiles(sourceCodeObject: string) {
    if (sourceCodeObject.startsWith('{{')) {
        return true
    }
    return false
}

function parseMultipleFilesContract(sourceCodeObject: string) {
    return JSON.parse(sourceCodeObject.slice(1, -1))
}

function parseCompilerVersion(compilerVersion: string) {
    if (compilerVersion.startsWith('v')) {
        return compilerVersion.slice(1)
    }
    return compilerVersion
}

function findFileNameFromContractName(contracts: any, contractName: string): string|null {
    for (let key of Object.keys(contracts))  {
        let contractsList = contracts[key]
        if (Object.keys(contractsList).includes(contractName)) {
            return key
        }
    }
    return null
}

async function caseContractHasMultipleFiles(compilerVersion: string, contractName: string, sourceCodeObject: string) {
    const sourceCode = parseMultipleFilesContract(sourceCodeObject)
    const compilerVersionParsed = parseCompilerVersion(compilerVersion)
    const compiled = await useCompiler(compilerVersionParsed, sourceCode)
    const output = JSON.parse(compiled as string);
    const fileName = findFileNameFromContractName(output.contracts, contractName)
    
    if (fileName=== null) {
        return {}
    }
    if (!output.contracts || !output.contracts[fileName] || !output.contracts[fileName][contractName] || !output.contracts[fileName][contractName].evm || !output.contracts[fileName][contractName].evm.bytecode) {
        const errorMessages = output.errors.filter((e: any) => e.severity === "error").map((e: any) => e.formattedMessage).join("\n");
        throw new Error("Compiler error:\n " + errorMessages);
        // throw new Error(RECOMPILATION_ERR_MSG);
    }
    

    const contract: any = output.contracts[fileName][contractName];
    return {
        creationBytecode: `0x${contract.evm.bytecode.object}`,
        deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
        // metadata: contract.metadata.trim()
    }
}

async function caseContractHasOneFile(compilerVersion: string, contractName: string, abi: any, sourceCodeObject: string) {
    const sourceCode = sourceCodeObject
    const compilerVersionParsed = parseCompilerVersion(compilerVersion)
    const fileName = `${contractName}.sol`

    const keccak256SourceCode = keccak256(sourceCode)

    // TODO: I don't know the best way to construct this object (like this it works)
    const solcJsonInput = {
        "language": "Solidity",
        "sources": {
            [fileName]: {
                "keccak256": keccak256SourceCode,
                "content": sourceCode
            }
        },
        "settings": {
            "optimizer": {
                "enabled": false,
            },
            "outputSelection": {
                [fileName]: {
                    [contractName]: [
                        'evm.bytecode.object',
                        'evm.deployedBytecode.object',
                        'metadata'
                    ]
                }
            }
        }
    }
    
    const compiled = await useCompiler(compilerVersionParsed, solcJsonInput)
    const output = JSON.parse(compiled as string);
    
    if (fileName=== null) {
        return {}
    }
    if (!output.contracts || !output.contracts[fileName] || !output.contracts[fileName][contractName] || !output.contracts[fileName][contractName].evm || !output.contracts[fileName][contractName].evm.bytecode) {
        const errorMessages = output.errors.filter((e: any) => e.severity === "error").map((e: any) => e.formattedMessage).join("\n");
        throw new Error("Compiler error:\n " + errorMessages);
        // throw new Error(RECOMPILATION_ERR_MSG);
    }
    

    const contract: any = output.contracts[fileName][contractName];
    return {
        creationBytecode: `0x${contract.evm.bytecode.object}`,
        deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
        // metadata: contract.metadata.trim()
    }
}

async function main(etherscanResponseFile: string) {
    // Instead of using a local file, call the Etherscan API: https://api.etherscan.io/api?module=contract&action=getsourcecode&address=0xa88f81f79bb05f25e9cd59572982388455380c06&apikey=YourApiKeyToken
    let resultsExampleJsonFile = await promises.readFile(`${__dirname}/etherscanResponses/${etherscanResponseFile}`)
    let resultsExampleJson = JSON.parse(await resultsExampleJsonFile.toString())
    const sourceCodeObject = resultsExampleJson.result[0].SourceCode
    let result = {}
    if (contractHasMultipleFiles(sourceCodeObject)) {
        result = await caseContractHasMultipleFiles(
            resultsExampleJson.result[0].CompilerVersion,
            resultsExampleJson.result[0].ContractName,
            sourceCodeObject
        )
    } else {
        const ABI = JSON.parse(resultsExampleJson.result[0].ABI)
        result = await caseContractHasOneFile(
            resultsExampleJson.result[0].CompilerVersion,
            resultsExampleJson.result[0].ContractName,
            ABI,
            sourceCodeObject
        )
    }
    console.log(result)
}

const ETHERSCAN_RESPONSE_MULTIPLE = 'multiple.example.json'
const ETHERSCAN_RESPONSE_SINGLE = 'single.example.json'

const selectedFile = ETHERSCAN_RESPONSE_MULTIPLE // or ETHERSCAN_RESPONSE_SINGLE
main(selectedFile)