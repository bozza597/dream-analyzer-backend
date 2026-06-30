import { Platform } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { DBClient } from "@/server/db";
import { UserModel } from "@/server/models/User";

export class UsersAdapter {

  constructor(private db: DBClient) { }

  async getById(id: string): Promise<UserModel | null> {
    const user = await this.db.user.findUnique({
      where: {
        id
      },
      include: {
        
      }
    })

    if (!user) {
      return null
    }

    return {
      ...user,
    }
  }

  async insert(data: Partial<UserModel>) {
    return this.db.user.create({ data: data as Prisma.UserCreateInput })
  }

  async updateById(id: string, data: Partial<UserModel>) {
    return this.db.user.update({
      where: {
        id
      },
      data
    })
  }

  async getFCMTokensByUserId(userId: string[]) {
    return this.db.fCMToken.findMany({
      where: {
        userId: {
          in: userId
        }
      }
    })
  }

  async insertFCMTokens(userId: string, tokens: string[], platform: Platform) {
    return this.db.fCMToken.createMany({
      data: tokens.map((token) => ({ userId, platform, token }))
    })
  }

  async updateFCMToken(userId: string, token: string) {
    return this.db.fCMToken.update({
      where: {
        token
      },
      data: {
        userId
      }
    })
  }

  async deleteFCMTokensByTokenId(token: string) {
    return this.db.fCMToken.deleteMany({
      where: {
        token
      }
    })
  }

  async deleteFCMTokensByUserId(userId: string) {
    return this.db.fCMToken.deleteMany({
      where: {
        userId
      }
    })
  }
}