import { Body, Controller, Delete, Get, HttpException, Param, Post, Put, UsePipes } from '@nestjs/common';
import { ValidationPipe } from '../shared/pipes/validation.pipe';
import { CreateUserDto, LoginUserDto, UpdateUserDto } from './dto';
import { User } from './user.decorator';
import { IUserRO, IPublicUserRO } from './user.interface';

import { UserService } from './user.service';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiBearerAuth()
@ApiTags('user')
@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('user/:username')
  async findByUsername(@Param('username') username: string): Promise<IPublicUserRO> {
    const userRO = this.userService.findByUsername(username);

    const publicUserRO: IPublicUserRO = {
      user: {
        bio: (await userRO).user.bio,
        email: (await userRO).user.email,
        image: (await userRO).user.image ?? '', // Use nullish coalescing operator to provide a default value
        username: (await userRO).user.username,
      },
    };

    return publicUserRO;
  }

  @Post('user/emailIds')
  async findMapByEmail(@Body('emails') emails: string[]): Promise<[number, string, string][]> {
    return this.userService.findUserIdsByEmails(emails);
  }

  @Post('user/userIds')
  async findMapByName(@Body('usernames') ids: string[]): Promise<[number, string, string][]> {
    return this.userService.findUserIdsByNames(ids);
  }

  @Get('user')
  async findMe(@User('email') email: string): Promise<IUserRO> {
    return this.userService.findByEmail(email);
  }

  @Put('user')
  async update(@User('id') userId: number, @Body('user') userData: UpdateUserDto) {
    return this.userService.update(userId, userData);
  }

  @UsePipes(new ValidationPipe())
  @Post('users')
  async create(@Body('user') userData: CreateUserDto) {
    return this.userService.create(userData);
  }

  @Delete('users/:slug')
  async delete(@Param() params: Record<string, string>): Promise<any> {
    return this.userService.delete(params.slug);
  }

  @UsePipes(new ValidationPipe())
  @Post('users/login')
  async login(@Body('user') loginUserDto: LoginUserDto): Promise<IUserRO> {
    const foundUser = await this.userService.findOne(loginUserDto);

    const errors = { User: ' not found' };
    if (!foundUser) {
      throw new HttpException({ errors }, 401);
    }
    const token = await this.userService.generateJWT(foundUser);
    const { email, username, bio, image } = foundUser;
    const user = { email, token, username, bio, image };
    return { user };
  }
}
