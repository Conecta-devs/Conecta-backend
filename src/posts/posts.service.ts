
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '../prisma/db.js';
import { CreatePostCommentDto } from './dto/create-post-comment.dto.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';

type PostRecord = Awaited<ReturnType<typeof db.orm.posts.all>>[number];
type PostCommentRecord =
  Awaited<ReturnType<typeof db.orm.post_comments.all>>[number];

@Injectable()
export class PostsService {
  private async findAuthor(authorId: string) {
    return db.orm.users
      .where({ _id: authorId })
      .first();
  }

  private isDuplicateLikeError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }

  private toAuthorResponse(author: Awaited<ReturnType<PostsService['findAuthor']>>) {
    return {
      id: author?._id ?? null,
      name: author?.name ?? null,
      image: author?.image ?? null,
    };
  }

  private async toCommentResponse(comment: PostCommentRecord) {
    const author = await this.findAuthor(comment.authorId);

    return {
      id: comment._id,
      postId: comment.postId,
      author: this.toAuthorResponse(author),
      content: comment.content,
      createdAt: comment.createdAt,
    };
  }

  private async toResponse(post: PostRecord, userId: string) {
    const [author, likes, comments] = await Promise.all([
      this.findAuthor(post.authorId),
      db.orm.post_likes.where({ postId: post._id }).all(),
      db.orm.post_comments
        .where({ postId: post._id })
        .orderBy({ createdAt: 1 })
        .all(),
    ]);

    return {
      id: post._id,
      title: post.title,
      content: post.content,
      authorId: post.authorId,
      author: this.toAuthorResponse(author),
      likeCount: likes.length,
      likedByMe: likes.some((like) => like.userId === userId),
      comments: await Promise.all(
        comments.map((comment) => this.toCommentResponse(comment)),
      ),
    };
  }

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

    return this.toResponse(post, userId);
  }

  async findOne(postId: string, userId: string) {
    const post = await db.orm.posts
      .where({ _id: postId })
      .first();

    if (!post) {
      throw new NotFoundException(
        'Publicação não encontrada.',
      );
    }

    return this.toResponse(post, userId);
  }

  async findAll(userId: string) {
    const posts = await db.orm.posts.all();

    return Promise.all(
      posts.map((post) => this.toResponse(post, userId)),
    );
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

    await Promise.all([
      db.orm.post_likes.where({ postId }).deleteAndCount(),
      db.orm.post_comments.where({ postId }).deleteAndCount(),
    ]);

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

    return this.toResponse(post, userId);
  }

  async toggleLike(postId: string, userId: string) {
    const post = await db.orm.posts
      .where({ _id: postId })
      .first();

    if (!post) {
      throw new NotFoundException(
        'Publicação não encontrada.',
      );
    }

    const existingLike = await db.orm.post_likes
      .where({ postId, userId })
      .first();

    if (existingLike) {
      await db.orm.post_likes
        .where({ _id: existingLike._id })
        .delete();
    } else {
      try {
        await db.orm.post_likes.create({
          postId,
          userId,
          createdAt: new Date(),
        });
      } catch (error) {
        // O índice único pode ganhar uma corrida entre dois cliques. Nesse
        // caso o like já existe e o estado lido abaixo é o verdadeiro.
        if (!this.isDuplicateLikeError(error)) {
          throw error;
        }
      }
    }

    const likes = await db.orm.post_likes
      .where({ postId })
      .all();

    return {
      liked: likes.some((like) => like.userId === userId),
      likeCount: likes.length,
    };
  }

  async addComment(
    postId: string,
    userId: string,
    dto: CreatePostCommentDto,
  ) {
    const content = dto.content?.trim();

    if (!content) {
      throw new BadRequestException(
        'O comentário não pode ficar vazio.',
      );
    }

    const post = await db.orm.posts
      .where({ _id: postId })
      .first();

    if (!post) {
      throw new NotFoundException(
        'Publicação não encontrada.',
      );
    }

    const comment = await db.orm.post_comments.create({
      postId,
      authorId: userId,
      content,
      createdAt: new Date(),
    });

    return this.toCommentResponse(comment);
  }

}
