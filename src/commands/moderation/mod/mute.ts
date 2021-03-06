import { Member, Message } from 'eris';
import moment, { Duration } from 'moment';

import { IMClient } from '../../../client';
import { MemberResolver, StringResolver } from '../../../resolvers';
import {
	punishments,
	PunishmentType,
	ScheduledActionType
} from '../../../sequelize';
import { CommandGroup, ModerationCommand } from '../../../types';
import { isPunishable, to } from '../../../util';
import { Command, Context } from '../../Command';

export default class extends Command {
	public constructor(client: IMClient) {
		super(client, {
			name: ModerationCommand.mute,
			aliases: [],
			args: [
				{
					name: 'user',
					resolver: MemberResolver,
					required: true
				},
				{
					name: 'reason',
					resolver: StringResolver,
					rest: true
				}
			],
			/*flags: [
				{
					name: 'duration',
					resolver: DurationResolver,
					short: 'd'
				}
			],*/
			group: CommandGroup.Moderation,
			strict: true,
			guildOnly: true
		});
	}

	public async action(
		message: Message,
		[targetMember, reason]: [Member, string],
		{ duration }: { duration: Duration },
		{ guild, me, settings, t }: Context
	): Promise<any> {
		const embed = this.client.mod.createBasicEmbed(targetMember);

		const mutedRole = settings.mutedRole;

		if (!mutedRole || !guild.roles.has(mutedRole)) {
			embed.description = t('cmd.mute.missingRole');
		} else if (isPunishable(guild, targetMember, message.member, me)) {
			await this.client.mod.informAboutPunishment(
				targetMember,
				PunishmentType.mute,
				settings,
				{ reason }
			);

			const [error] = await to(targetMember.addRole(mutedRole, reason));

			if (error) {
				embed.description = t('cmd.mute.error', { error });
			} else {
				const punishment = await punishments.create({
					id: null,
					guildId: guild.id,
					memberId: targetMember.id,
					type: PunishmentType.mute,
					amount: 0,
					args: '',
					reason: reason,
					creatorId: message.author.id
				});

				this.client.mod.logPunishmentModAction(
					guild,
					targetMember.user,
					punishment.type,
					punishment.amount,
					[{ name: 'Reason', value: reason }],
					message.author
				);

				if (duration) {
					this.client.scheduler.addScheduledAction(
						guild.id,
						ScheduledActionType.unmute,
						{ memberId: targetMember.id },
						moment()
							.add(duration)
							.toDate(),
						'Unmute from timed mute command'
					);
				}

				embed.description = t('cmd.mute.done');
			}
		} else {
			embed.description = t('cmd.mute.canNotMute');
		}

		const response = await this.sendReply(message, embed);

		if (settings.modPunishmentMuteDeleteMessage) {
			const func = () => {
				message.delete().catch(() => undefined);
				response.delete().catch(() => undefined);
			};
			setTimeout(func, 4000);
		}
	}
}
