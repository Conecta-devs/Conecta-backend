
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard.js';
import { CreatePostCommentDto } from './dto/create-post-comment.dto.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PostsService } from './posts.service.js';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    name: string;
  };
};

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
  ) {}

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.create(
      req.user.sub,
      dto,
    );
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.postsService.findAll(req.user.sub);
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.postsService.findOne(id, req.user.sub);
  }

  @Delete(':id')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.postsService.remove(
      id,
      req.user.sub,
    );
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.update(
      id,
      req.user.sub,
      dto,
    );
  }

  @Put(':id/like')
  toggleLike(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.postsService.toggleLike(id, req.user.sub);
  }

  @Post(':id/comments')
  addComment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreatePostCommentDto,
  ) {
    return this.postsService.addComment(id, req.user.sub, dto);
  }
}
