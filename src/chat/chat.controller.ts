import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard.js';
import { AddMembersDto } from './dto/add-members.dto.js';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto.js';
import { CreateGroupDto } from './dto/create-group.dto.js';
import { DiscoverUsersQueryDto } from './dto/discover-users-query.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    name: string;
  };
};

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get('users')
  discoverUsers(
    @Req() request: AuthenticatedRequest,
    @Query() query: DiscoverUsersQueryDto,
  ) {
    return this.chatService.discoverUsers(request.user.sub, query);
  }

  @Get('conversations')
  listConversations(@Req() request: AuthenticatedRequest) {
    return this.chatService.listConversations(request.user.sub);
  }

  @Post('conversations/direct')
  async createOrGetDirectConversation(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateDirectConversationDto,
  ) {
    const conversation = await this.chatService.createOrGetDirectConversation(
      request.user.sub,
      dto.participantId,
    );
    this.chatGateway.publishConversationAvailable(
      conversation.id,
      conversation.members.map((member) => member.userId),
    );
    return conversation;
  }

  @Post('conversations/groups')
  async createGroup(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateGroupDto,
  ) {
    const conversation = await this.chatService.createGroup(
      request.user.sub,
      dto,
    );
    this.chatGateway.publishConversationAvailable(
      conversation.id,
      conversation.members.map((member) => member.userId),
    );
    return conversation;
  }

  @Get('conversations/:conversationId')
  getConversation(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    return this.chatService.getConversation(request.user.sub, conversationId);
  }

  @Get('conversations/:conversationId/messages')
  getHistory(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getHistory(
      request.user.sub,
      conversationId,
      before,
      limit,
    );
  }

  @Post('conversations/:conversationId/messages')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async sendMessage(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    const result = await this.chatService.sendMessage(
      request.user.sub,
      conversationId,
      dto,
    );
    if (!result.duplicate) {
      this.chatGateway.publishMessage(
        result.message,
        result.conversation,
        result.unreadUpdates,
      );
    }
    return result.message;
  }

  @Post('conversations/:conversationId/read')
  async markRead(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    const result = await this.chatService.markRead(
      request.user.sub,
      conversationId,
    );
    this.chatGateway.publishRead(request.user.sub, result);
    return result;
  }

  @Post('conversations/:conversationId/members')
  async addMembers(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body() dto: AddMembersDto,
  ) {
    const result = await this.chatService.addMembers(
      request.user.sub,
      conversationId,
      dto,
    );
    this.chatGateway.publishMembershipChange(
      conversationId,
      result.members.map((member) => member.userId),
    );
    return result;
  }

  @Delete('conversations/:conversationId/members/:memberId')
  async removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Param('memberId') memberId: string,
  ) {
    const result = await this.chatService.removeMember(
      request.user.sub,
      conversationId,
      memberId,
    );
    this.chatGateway.publishMembershipChange(
      conversationId,
      result.members.map((member) => member.userId),
      result.removedUserId,
    );
    return result;
  }

  @Post('conversations/:conversationId/leave')
  async leaveGroup(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    const result = await this.chatService.leaveGroup(
      request.user.sub,
      conversationId,
    );
    this.chatGateway.publishMembershipChange(
      conversationId,
      result.members.map((member) => member.userId),
      result.removedUserId,
    );
    return result;
  }
}
