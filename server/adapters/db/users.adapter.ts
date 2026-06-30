import { Platform } from "@/generated/prisma/enums";
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
        couples: {
          where: {
            deletedAt: null
          },
          include: {
            challenges: {
              orderBy: {
                assignedAt: "desc"
              },
              take: 10
            }
          }
        },
        partners: {
          where: {
            deletedAt: null
          },
          include: {
            challenges: {
              orderBy: {
                assignedAt: "desc"
              },
              take: 10
            }
          }
        }
      }
    })

    if (!user) {
      return null
    }

    const couple = (user.couples.length > 0 || user.partners.length > 0) ? (user.couples[0] || user.partners[0]) : null;

    return {
      ...user,
      couple: couple,
    }
  }

  async insert(data: Partial<UserModel>) {
    return this.db.user.create({ data })
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

  async getFCMTokensByCoupleId(coupleId: string) {
    // Get the couple to find both user IDs
    const couple = await this.db.couple.findUnique({
      where: {
        id: coupleId,
        deletedAt: null
      },
      select: {
        createdById: true,
        partnerId: true
      }
    });

    if (!couple) {
      return [];
    }

    // Collect user IDs (filter out null partnerId)
    const userIds = [couple.createdById];
    if (couple.partnerId) {
      userIds.push(couple.partnerId);
    }

    // Get FCM tokens for all users in the couple, including user country for localization
    return this.db.fCMToken.findMany({
      where: {
        userId: {
          in: userIds
        }
      },
      include: {
        user: {
          select: {
            country: true
          }
        }
      }
    });
  }
}