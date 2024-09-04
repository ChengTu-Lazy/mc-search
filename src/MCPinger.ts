import motdParser from '@sfirew/minecraft-motd-parser';
import * as net from 'net';

export class MCPinger {
    // 定义一个属性来存储与服务器的连接实例
    public instance: net.Socket | null = null;

    constructor() {
    }

    /**
     * 编码 VarInt 为 Buffer
     * VarInt 是一种可变长度的整数编码方法，广泛用于 Minecraft 网络协议
     * @param value - 要编码的整数值
     * @returns 编码后的 Buffer
     */
    encodeVarInt(value: number): Buffer {
        const bytes: number[] = [];
        while (true) {
            if ((value & ~0x7F) === 0) {
                bytes.push(value);
                break;
            } else {
                bytes.push((value & 0x7F) | 0x80);
                value >>>= 7;
            }
        }
        return Buffer.from(bytes);
    }

    /**
     * 将字符串编码为带有前置长度的 Buffer
     * Minecraft 协议中字符串通常以 VarInt 表示长度，然后是字符串的 UTF-8 编码
     * @param value - 要编码的字符串
     * @returns 编码后的 Buffer
     */
    writeString(value: string): Buffer {
        const stringBuffer = Buffer.from(value, 'utf8');
        return Buffer.concat([this.encodeVarInt(stringBuffer.length), stringBuffer]);
    }

    /**
     * 解析服务器响应数据
     * 从数据中提取 JSON 字符串并进行解析
     * @param data - 来自服务器的原始数据 Buffer
     * @returns 解析后的 JSON 对象
     */
    parseServerResponse(data: Buffer): any {
        // 找到 JSON 数据的起始位置（第一个 '{' 字符）
        const startIndex = data.indexOf('{');
        if (startIndex === -1) {
            throw new Error('无法找到有效的 JSON 开始位置');
        }

        // 提取并解析 JSON 字符串
        const jsonString = data.slice(startIndex).toString('utf8');
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('JSON 解析错误:', error);
            return null;
        }
    }

    /**
     * 解码 VarInt
     * 从 Buffer 中解码出 VarInt 的值及其字节长度
     * @param buffer - 包含 VarInt 数据的 Buffer
     * @returns 一个元组 [解码后的值, 消耗的字节数]
     */
    decodeVarInt(buffer: Buffer): [number, number] {
        let value = 0;
        let length = 0;
        let currentByte: number;

        while (true) {
            currentByte = buffer[length];
            value |= (currentByte & 0x7F) << (length * 7);

            length++;

            if ((currentByte & 0x80) === 0) {
                break;
            }

            if (length > 5) {
                throw new Error("VarInt is too big");
            }
        }

        return [value, length];
    }

    // 函数：去除字符串中的Minecraft颜色代码
    cleanMinecraftText(text: string): string {
        return text.replace(/§[0-9a-fk-or]/g, '');
    }

    // 生成输出字符串
    generateOutput(data: { max: number, online: number, sample: { name: string, id: string }[] }): string {
        let result = `${data.online}/${data.max}`;
        if (data.online != 0 && data.sample != undefined) {
            result += `\n`
            data.sample.forEach((player, index) => {
                const cleanName = this.cleanMinecraftText(player.name);
                result += `${index + 1}.${cleanName}\n`;
            });
        }
        return result;
    }

    // /**
    //  * Ping 一个 Minecraft 服务器以获取其状态信息
    //  * @param IP - 服务器 IP 地址
    //  * @param Port - 服务器端口号
    //  * @param Version - 协议版本（默认 765，表示 Minecraft 1.20.1）
    //  */
    public Ping(IP: string, Port: number, Version: number = 765): Promise<string> {
        return new Promise((resolve, reject) => {
            this.instance = net.createConnection({ host: IP, port: Port }, () => {
            // console.log('已连接到服务器！');
            // 构造握手数据包
            const packetId: Buffer = this.encodeVarInt(0x00); // 握手包ID为0x00
            const protocolVersion: Buffer = this.encodeVarInt(Version); // 使用指定协议版本
            const serverAddress: Buffer = this.writeString(IP);
            const serverPort: Buffer = Buffer.alloc(2);
            serverPort.writeUInt16BE(Port); // 写入端口号
            const nextState: Buffer = this.encodeVarInt(1); // 1 表示状态请求

            const packetData: Buffer = Buffer.concat([
                packetId,
                protocolVersion,
                serverAddress,
                serverPort,
                nextState
            ]);

            // 计算数据包总长度并发送握手数据包
            const packetLength: Buffer = this.encodeVarInt(packetData.length);
            const fullPacket: Buffer = Buffer.concat([packetLength, packetData]);
            this.instance?.write(fullPacket);
            // console.log('握手数据包已发送');

            // 发送状态请求数据包
            const statusRequest = Buffer.concat([this.encodeVarInt(1), this.encodeVarInt(0x00)]);
            this.instance?.write(statusRequest);
            // console.log('状态请求已发送');
            });
    
            let buffer = Buffer.alloc(0);
            let expectedLength: number | null = null;
    
            // 处理服务器的响应
            this.instance.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
    
                if (expectedLength === null && buffer.length >= 5) {
                    const [packetLength, bytesRead] = this.decodeVarInt(buffer);
                    expectedLength = packetLength + bytesRead;
                }
    
                if (expectedLength !== null && buffer.length >= expectedLength) {
                    const completeData = buffer.slice(0, expectedLength);
                    buffer = buffer.slice(expectedLength);
    
                    const parsedData = this.parseServerResponse(completeData);
    
                    if (parsedData) {
                        const autoJsonResult = motdParser.JSONToCleanedText(parsedData.description);
                        const result = `(${this.generateOutput(parsedData.players)})\nMotd:${autoJsonResult}\n地址:${IP}:${Port}`;
                        this.instance?.end(); // 关闭连接
                        resolve(result); // 返回结果
                    } else {
                        reject(new Error('解析服务器响应失败'));
                    }
                }
            });
    
            // 处理连接错误
            this.instance.on('error', (err) => {
                console.error('连接出错:', err);
                reject(err); // 返回错误
            });
        });
    }
}
