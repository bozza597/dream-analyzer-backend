import { UserRecord } from "firebase-admin/auth";
import { NextRequest } from "next/server";
import { UsersAdapter } from "../adapters/db/users.adapter";
import { DreamsAdapter } from "../adapters/db/dreams.adapter";
import { RecapsAdapter } from "../adapters/db/recaps.adapter";
import { UserModel } from "../models/User";
import { FileAdapter } from "../adapters/file.adapter";
import { UsersService } from "../services/users.service";
import { DreamsService } from "../services/dreams.service";
import { RecapsService } from "../services/recaps.service";

export type Adapters = {
  db: {
    users: UsersAdapter;
    dreams: DreamsAdapter;
    recaps: RecapsAdapter;
  },
  file: FileAdapter,
}

export type AppContext = {
  req: NextRequest;
  jwt: string | null;
  authUser: UserRecord | null;
  user: UserModel | null;
  adapters: Adapters
  services: {
    users: UsersService
    dreams: DreamsService
    recaps: RecapsService
  }
}