
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '../prisma/db.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';

@Injectable()
export class PostsService {
  async create(userId: string, dto: CreatePostDto) {
    const title = dto.title?.trim();

    if (!title) {
      throw new BadRequestException(
        'O título do post é obrigatório.',
      );
    }

    if (
      dto.content !== undefined &&
      dto.content !== null &&
      typeof dto.content !== 'string'
    ) {
      throw new BadRequestException(
        'O conteúdo deve ser um texto.',
      );
    }

    const content = dto.content?.trim() || null;

    const post = await db.orm.posts.create({
      title,
      content,
      authorId: userId,
    });

    return {
      id: post._id,
      title: post.title,
      content: post.content,
      authorId: post.authorId,
    };
  }

  async findOne(postId: string) {
  const post = await db.orm.posts
    .where({ _id: postId })
    .first();

  if (!post) {
    throw new NotFoundException(
      'Publicação não encontrada.',
    );
  }

  return {
    id: post._id,
    title: post.title,
    content: post.content,
    authorId: post.authorId,
  };
}

  async findAll() {
  const posts = await db.orm.posts.all();

  return posts.map((post) => ({
    id: post._id,
    title: post.title,
    content: post.content,
    authorId: post.authorId,
  }));
}

async remove(postId: string, userId: string) {
  const post = await db.orm.posts
    .where({ _id: postId, authorId: userId })
    .delete();

  if (!post) {
    throw new NotFoundException(
      'Publicação não encontrada.',
    );
  }

  return {
    message: 'Publicação excluída com sucesso.',
    id: post._id,
  };
}

async update(
  postId: string,
  userId: string,
  dto: UpdatePostDto,
) {
  const title =
    dto.title === undefined ? undefined : dto.title.trim();

  const content =
    dto.content === undefined || dto.content === null
      ? dto.content
      : dto.content.trim() || null;

  if (title !== undefined && !title) {
    throw new BadRequestException(
      'O título do post é obrigatório.',
    );
  }

  const post = await db.orm.posts
    .where({ _id: postId, authorId: userId })
    .update({
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
    });

  if (!post) {
    throw new NotFoundException(
      'Publicação não encontrada.',
    );
  }

  return {
    id: post._id,
    title: post.title,
    content: post.content,
    authorId: post.authorId,
  };
}

}
