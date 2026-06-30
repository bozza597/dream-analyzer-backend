import { UsersAdapter } from "../adapters/db/users.adapter";
import { UserModel } from "../models/User";

export class UsersService {
  constructor(private usersAdapter: UsersAdapter) {}

  async getUserById(id: string): Promise<UserModel | null> {
    const user = await this.usersAdapter.getById(id);
    
    if(!user) {
      return null;
    }

    return {
      ...user,
    }
  }

  async createUser(data: Partial<UserModel>) {
    return this.usersAdapter.insert(data);
  }

  async updateUserById(id: string, data: Partial<UserModel>) {
    return this.usersAdapter.updateById(id, data);
  }
}