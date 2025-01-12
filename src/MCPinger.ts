import * as net from 'net';

export class MCPinger {
    public instance: net.Socket | null = null;

    // 定义常量
    private static readonly HANDSHAKE_PACKET_ID = 0x00;
    private static readonly STATUS_REQUEST_PACKET_ID = 0x00;
    private static readonly NEXT_STATE_STATUS = 1;
    private static readonly DEFAULT_PROTOCOL_VERSION = 765; // Minecraft 1.20.1

    constructor() { }

    /**
     * 编码 VarInt 为 Buffer
     * @param value - 要编码的整数值
     * @returns 编码后的 Buffer
     */
    private encodeVarInt(value: number): Buffer {
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
     * @param value - 要编码的字符串
     * @returns 编码后的 Buffer
     */
    private writeString(value: string): Buffer {
        const stringBuffer = Buffer.from(value, 'utf8');
        return Buffer.concat([this.encodeVarInt(stringBuffer.length), stringBuffer]);
    }

    /**
     * 解析服务器响应数据
     * @param data - 来自服务器的原始数据 Buffer
     * @returns 解析后的 JSON 对象
     */
    private parseServerResponse(data: Buffer): any {
        const startIndex = data.indexOf('{');
        if (startIndex === -1) {
            throw new Error('无法找到有效的 JSON 开始位置');
        }

        const jsonString = data.slice(startIndex).toString('utf8');
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            throw new Error(`JSON 解析错误: ${error}`);
        }
    }

    /**
     * 解码 VarInt
     * @param buffer - 包含 VarInt 数据的 Buffer
     * @returns 一个元组 [解码后的值, 消耗的字节数]
     */
    private decodeVarInt(buffer: Buffer): [number, number] {
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

    /**
     * 去除字符串中的 Minecraft 颜色代码
     * @param text - 原始字符串
     * @returns 清理后的字符串
     */
    private cleanMinecraftText(text: string): string {
        return text.replace(/§[0-9a-fk-or]/g, '');
    }

    /**
     * 生成输出字符串
     * @param data - 服务器返回的玩家数据
     * @returns 格式化后的字符串
     */
    private generateOutput(data: { max: number, online: number, sample: { name: string, id: string }[] }): string {
        let result = `(${data.online}/${data.max})`;
        if (data.online !== 0 && data.sample) {
            result += `\n`;
            data.sample.forEach((player, index) => {
                const cleanName = this.cleanMinecraftText(player.name);
                result += `${index + 1}. ${cleanName}\n`;
            });
        }
        return result;
    }

    /**
     * 构造握手数据包
     * @param IP - 服务器 IP 地址
     * @param Port - 服务器端口号
     * @param Version - 协议版本
     * @returns 握手数据包
     */
    private createHandshakePacket(IP: string, Port: number, Version: number): Buffer {
        const packetId = this.encodeVarInt(MCPinger.HANDSHAKE_PACKET_ID);
        const protocolVersion = this.encodeVarInt(Version);
        const serverAddress = this.writeString(IP);
        const serverPort = Buffer.alloc(2);
        serverPort.writeUInt16BE(Port);
        const nextState = this.encodeVarInt(MCPinger.NEXT_STATE_STATUS);

        return Buffer.concat([packetId, protocolVersion, serverAddress, serverPort, nextState]);
    }

    /**
     * 构造状态请求数据包
     * @returns 状态请求数据包
     */
    private createStatusRequestPacket(): Buffer {
        return Buffer.concat([this.encodeVarInt(1), this.encodeVarInt(MCPinger.STATUS_REQUEST_PACKET_ID)]);
    }

    /**
     * 将 Minecraft MOTD 从 JSON 格式转换为纯文本，并去除颜色代码和格式化符号
     * @param motd - MOTD 数据（可以是字符串或 JSON 对象）
     * @returns 清理后的纯文本
     */
    private parseMOTD(motd: string | any): string {
        // 如果 MOTD 是 JSON 对象，提取 text 字段
        if (typeof motd === 'object' && motd !== null) {
            if (motd.text) {
                motd = motd.text;
            } else {
                motd = '';
            }
        }

        // 如果 MOTD 是字符串，去除颜色代码和格式化符号
        if (typeof motd === 'string') {
            return motd.replace(/§[0-9a-fk-or]/g, '');
        }

        // 如果 MOTD 是其他类型，返回空字符串
        return '';
    }

    /**
     * Ping 一个 Minecraft 服务器以获取其状态信息
     * @param IP - 服务器 IP 地址
     * @param Port - 服务器端口号
     * @param Version - 协议版本（默认 765，表示 Minecraft 1.20.1）
     * @returns 包含服务器信息的字符串
     */
    public async Ping(IP: string, Port: number, Version: number = MCPinger.DEFAULT_PROTOCOL_VERSION): Promise<string> {
        return new Promise((resolve, reject) => {
            this.instance = net.createConnection({ host: IP, port: Port }, () => {
                try {
                    // 发送握手数据包
                    const handshakePacket = this.createHandshakePacket(IP, Port, Version);
                    const packetLength = this.encodeVarInt(handshakePacket.length);
                    const fullHandshakePacket = Buffer.concat([packetLength, handshakePacket]);
                    this.instance?.write(fullHandshakePacket);

                    // 发送状态请求数据包
                    const statusRequestPacket = this.createStatusRequestPacket();
                    this.instance?.write(statusRequestPacket);
                } catch (error) {
                    reject(`数据包构造或发送失败: ${error}`);
                }
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

                    try {
                        const parsedData = this.parseServerResponse(completeData);
                        const autoJsonResult = this.parseMOTD(parsedData.description);
                        const result = `${this.generateOutput(parsedData.players)}Motd: ${autoJsonResult}\n地址: ${IP}:${Port}`;
                        this.instance?.end();
                        resolve(result);
                    } catch (error) {
                        reject(`解析服务器响应失败: ${error}`);
                    }
                }
            });

            // 处理连接错误
            this.instance.on('error', (err) => {
                reject(`连接出错: ${err}`);
            });
        });
    }
}